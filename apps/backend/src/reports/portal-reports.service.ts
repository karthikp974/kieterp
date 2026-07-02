import { formatIstDate } from "../common/ist-time.util";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AttendanceEntryStatus,
  FeePaymentStatus,
  PermissionAction,
  Prisma,
  ResultEntryStatus,
  StructureStatus,
  TeacherRoleKind,
  UserStatus,
  UserType
} from "@prisma/client";
import { Response } from "express";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { sendTabularExport } from "../common/tabular-export.util";
import { isInstitutionWideAdmin } from "../permissions/campus-scope.service";
import { PermissionsService } from "../permissions/permissions.service";
import { deriveFeeStatus } from "../portals/teacher-portal-finance.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  PortalReportsDashboardQueryDto,
  PortalReportsExportQueryDto,
  PortalReportsScopeQueryDto
} from "./portal-reports.dto";
import {
  buildSectionReportFilename,
  compositePerformancePercent,
  computeSemesterSgpa,
  readPortalReportThresholds,
  sgpaToGradeBadge
} from "./portal-reports.util";
import { assertReportExportRateLimit } from "./reports-export-rate-limit";

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
  };
}>;

type ReportsContext = {
  mode: "admin" | "htpo" | "ctpo";
  showSectionFilter: boolean;
  showSectionWisePerformance: boolean;
  sections: { id: string; label: string; name: string }[];
  sectionIds: string[];
  primarySectionId: string | null;
  primarySectionName: string | null;
};

@Injectable()
export class PortalReportsService {
  private readonly thresholds = readPortalReportThresholds();

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async getSetup(user: AuthUser) {
    const ctx = await this.resolveContext(user, {});
    if (ctx.primarySectionId) {
      this.assertReportsAccess(user, await this.scopeForSectionId(ctx.primarySectionId));
    } else if (user.type === UserType.ADMIN) {
      this.assertReportsAccess(user, this.adminDefaultScope(user));
    } else if (!ctx.sections.length) {
      throw new ForbiddenException("No sections available for reports.");
    }
    return {
      mode: ctx.mode,
      showSectionFilter: ctx.showSectionFilter,
      showSectionWisePerformance: ctx.showSectionWisePerformance,
      sections: ctx.sections,
      fixedSectionId: ctx.showSectionFilter ? null : ctx.primarySectionId,
      thresholds: this.thresholds
    };
  }

  async getDashboard(user: AuthUser, query: PortalReportsDashboardQueryDto) {
    const ctx = await this.resolveContext(user, query);
    const scope = ctx.primarySectionId ? await this.scopeForSectionId(ctx.primarySectionId) : this.adminDefaultScope(user);
    this.assertReportsAccess(user, scope);
    await this.auditFilterUsage(user, query, ctx);

    const sectionId = ctx.primarySectionId;
    const trimmedSection = query.sectionId?.trim();
    let kpiTargetId: string | null = trimmedSection || null;
    if (!kpiTargetId && ctx.mode === "ctpo") {
      kpiTargetId = ctx.primarySectionId;
    }
    if (!kpiTargetId && ctx.mode === "htpo" && ctx.sectionIds.length === 1) {
      kpiTargetId = ctx.sectionIds[0]!;
    }

    let kpis;
    if (kpiTargetId) {
      kpis = await this.computeSectionKpis(user, kpiTargetId, ctx.mode);
    } else if (ctx.sectionIds.length) {
      kpis = await this.computeAggregateKpis(user, ctx.sectionIds, ctx.mode);
    } else {
      kpis = this.emptyKpis(ctx.mode);
    }

    const listSectionId = kpiTargetId ?? ctx.sectionIds[0] ?? null;
    const sectionPerformance = ctx.showSectionWisePerformance
      ? await this.listSectionPerformance(user, ctx.sectionIds)
      : [];

    const topPerformers = listSectionId
      ? await this.listTopPerformers(listSectionId, query.performersPageSize)
      : { items: [] as const, total: 0 };
    const needAttention = listSectionId
      ? await this.listNeedAttention(user, listSectionId, query.attentionPageSize)
      : { items: [] as const, total: 0 };

    return {
      mode: ctx.mode,
      sectionId: kpiTargetId ?? sectionId,
      sectionLabel: ctx.sections.find((s) => s.id === (kpiTargetId ?? sectionId))?.label ?? null,
      thresholds: this.thresholds,
      kpis,
      sectionPerformance,
      topPerformers,
      needAttention
    };
  }

  async exportReport(user: AuthUser, query: PortalReportsExportQueryDto, response: Response) {
    try {
      assertReportExportRateLimit(user.id);
    } catch {
      throw new HttpException("Too many export requests. Please wait a minute and try again.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const ctx = await this.resolveContext(user, query);
    if (!ctx.primarySectionId) {
      throw new BadRequestException("Select a section before exporting.");
    }
    const scope = await this.scopeForSectionId(ctx.primarySectionId);
    this.assertReportsAccess(user, scope);

    const section = await this.prisma.section.findFirst({
      where: { id: ctx.primarySectionId, isArchived: false },
      select: { id: true, name: true }
    });
    if (!section) throw new NotFoundException("Section not found.");

    const filename = buildSectionReportFilename(section.name, query.format);
    const title = `${section.name} report — ${query.kind}`;

    let rows: (string | number)[][] = [];
    if (query.kind === "attendance") {
      this.assertModuleAccess(user, PermissionAction.VIEW_ATTENDANCE, scope);
      rows = await this.buildAttendanceExportRows(ctx.primarySectionId);
    } else if (query.kind === "grades") {
      this.assertModuleAccess(user, PermissionAction.VIEW_RESULTS, scope);
      rows = await this.buildGradesExportRows(ctx.primarySectionId);
    } else {
      this.assertModuleAccess(user, PermissionAction.VIEW_FEES, scope);
      rows = await this.buildFinanceExportRows(ctx.primarySectionId);
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.auditUserId,
        action: "REPORT_EXPORT",
        entity: "Section",
        entityId: section.id,
        metadata: {
          kind: query.kind,
          format: query.format,
          filename,
          sectionName: section.name,
          mode: ctx.mode
        } as Prisma.InputJsonObject
      }
    });

    await sendTabularExport(response, query.format, filename.replace(/\.[^.]+$/, ""), title, rows);
  }

  private async resolveContext(user: AuthUser, query: PortalReportsScopeQueryDto): Promise<ReportsContext> {
    if (user.type === UserType.ADMIN) {
      return this.resolveAdminContext(user, query);
    }
    if (user.type !== UserType.TEACHER) {
      throw new ForbiddenException("Reports dashboard is available to teachers and admins only.");
    }
    return this.resolveTeacherContext(user, query);
  }

  private async resolveTeacherContext(user: AuthUser, query: PortalReportsScopeQueryDto): Promise<ReportsContext> {
    const teacher = await this.getActiveTeacher(user.id);
    const roles = [...new Set(teacher.assignments.map((a) => a.role))];
    const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
    const hasCtpo = roles.includes(TeacherRoleKind.CTPO);
    if (!hasHtpo && !hasCtpo) {
      throw new ForbiddenException("Reports require HTPO or CTPO role.");
    }

    const sections = await this.loadTeacherSections(user, teacher, hasHtpo, hasCtpo);
    if (!sections.length) {
      return {
        mode: hasHtpo ? "htpo" : "ctpo",
        showSectionFilter: hasHtpo,
        showSectionWisePerformance: hasHtpo,
        sections: [],
        sectionIds: [],
        primarySectionId: null,
        primarySectionName: null
      };
    }

    const accessibleIds = sections.map((s) => s.id);
    const trimmed = query.sectionId?.trim();
    if (trimmed && !accessibleIds.includes(trimmed)) {
      throw new ForbiddenException("You cannot view reports for this section.");
    }

    const primarySectionId = trimmed ?? (hasHtpo ? null : sections[0]?.id ?? null);
    const primary = sections.find((s) => s.id === primarySectionId) ?? sections[0]!;

    return {
      mode: hasHtpo ? "htpo" : "ctpo",
      showSectionFilter: hasHtpo,
      showSectionWisePerformance: hasHtpo,
      sections,
      sectionIds: hasHtpo && !trimmed ? accessibleIds : primarySectionId ? [primarySectionId] : accessibleIds,
      primarySectionId,
      primarySectionName: primary.name
    };
  }

  private async resolveAdminContext(user: AuthUser, query: PortalReportsScopeQueryDto): Promise<ReportsContext> {
    const scope = this.resolveAdminScope(user, query);
    this.assertReportsAccess(user, scope);

    const where = this.sectionsWhereFromScope(scope);
    const sectionRows = await this.prisma.section.findMany({
      where,
      include: this.sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }],
      take: 200
    });

    const sections = sectionRows.map((section) => ({
      id: section.id,
      label: this.sectionLabel(section),
      name: section.name
    }));

    const accessibleIds = sections.map((s) => s.id);
    const trimmed = query.sectionId?.trim();
    if (trimmed && !accessibleIds.includes(trimmed)) {
      throw new ForbiddenException("Section is outside your allowed scope.");
    }

    const primarySectionId = trimmed || null;
    const primary = sections.find((s) => s.id === primarySectionId);

    return {
      mode: "admin",
      showSectionFilter: true,
      showSectionWisePerformance: true,
      sections,
      sectionIds: trimmed ? [trimmed] : accessibleIds,
      primarySectionId,
      primarySectionName: primary?.name ?? null
    };
  }

  private async loadTeacherSections(
    user: AuthUser,
    teacher: Awaited<ReturnType<typeof this.getActiveTeacher>>,
    hasHtpo: boolean,
    hasCtpo: boolean
  ) {
    const sectionMap = new Map<string, { id: string; label: string; name: string }>();

    if (hasHtpo) {
      const sections = await this.prisma.section.findMany({
        where: this.sectionsWhereForHtpo(teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO)),
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_REPORTS, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section), name: section.name });
        }
      }
    }

    const ctpoSectionIds = [
      ...new Set(
        teacher.assignments.filter((a) => a.role === TeacherRoleKind.CTPO && a.sectionId).map((a) => a.sectionId!)
      )
    ];
    if (hasCtpo && ctpoSectionIds.length) {
      const sections = await this.prisma.section.findMany({
        where: { id: { in: ctpoSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_REPORTS, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section), name: section.name });
        }
      }
    }

    if (!hasHtpo && ctpoSectionIds.length) {
      for (const key of [...sectionMap.keys()]) {
        if (!ctpoSectionIds.includes(key)) sectionMap.delete(key);
      }
    }

    return [...sectionMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  private async computeSectionKpis(user: AuthUser, sectionId: string, mode: ReportsContext["mode"]) {
    const scope = await this.scopeForSectionId(sectionId);
    const [passRate, avgAttendance, feeCollection] = await Promise.all([
      this.passRateForSection(user, scope, sectionId),
      this.attendancePercentForSection(user, scope, sectionId),
      this.feeCollectionForSection(user, scope, sectionId)
    ]);

    return {
      passRate: { percent: passRate, label: mode === "htpo" ? "Department-wide" : "Section-wide" },
      avgAttendance: { percent: avgAttendance, label: "This semester" },
      feeCollection: { percent: feeCollection, label: mode === "htpo" ? "All sections" : "This section" }
    };
  }

  private async computeAggregateKpis(user: AuthUser, sectionIds: string[], mode: ReportsContext["mode"]) {
    const [passRate, avgAttendance, feeCollection] = await Promise.all([
      this.passRateForSections(user, sectionIds),
      this.attendancePercentForSections(user, sectionIds),
      this.feeCollectionForSections(user, sectionIds)
    ]);

    const scopeLabel =
      mode === "admin" ? "Filtered scope" : mode === "htpo" ? "Department-wide" : "All sections";

    return {
      passRate: { percent: passRate, label: scopeLabel },
      avgAttendance: { percent: avgAttendance, label: "This semester" },
      feeCollection: { percent: feeCollection, label: mode === "admin" ? "Filtered scope" : "All sections" }
    };
  }

  private emptyKpis(mode: ReportsContext["mode"]) {
    return {
      passRate: { percent: 0, label: mode === "admin" ? "Filtered scope" : "Section-wide" },
      avgAttendance: { percent: 0, label: "This semester" },
      feeCollection: { percent: 0, label: "This section" }
    };
  }

  private async listSectionPerformance(user: AuthUser, sectionIds: string[]) {
    const items = await Promise.all(
      sectionIds.map(async (sectionId) => {
        const scope = await this.scopeForSectionId(sectionId);
        const section = await this.prisma.section.findFirst({
          where: { id: sectionId },
          include: this.sectionInclude
        });
        if (!section) return null;
        const [passRate, attendance, fee] = await Promise.all([
          this.passRateForSection(user, scope, sectionId),
          this.attendancePercentForSection(user, scope, sectionId),
          this.feeCollectionForSection(user, scope, sectionId)
        ]);
        const parts: number[] = [];
        if (this.permissions.can(user, { action: PermissionAction.VIEW_RESULTS, scope }).allowed) parts.push(passRate);
        if (this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE, scope }).allowed) parts.push(attendance);
        if (this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope }).allowed) parts.push(fee);
        return {
          sectionId,
          label: this.sectionLabel(section),
          percent: compositePerformancePercent(parts)
        };
      })
    );
    return items.filter(Boolean).sort((a, b) => (b!.percent ?? 0) - (a!.percent ?? 0)) as { sectionId: string; label: string; percent: number }[];
  }

  private async listTopPerformers(sectionId: string, limit: number) {
    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      include: { user: { select: { fullName: true } } }
    });
    if (!students.length) return { items: [], total: 0 };

    const studentIds = students.map((s) => s.id);
    const entries = await this.prisma.resultEntry.findMany({
      where: { studentProfileId: { in: studentIds }, isPublished: true },
      select: { studentProfileId: true, semesterNumber: true, grade: true, credits: true, status: true }
    });

    const byStudentSem = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = `${entry.studentProfileId}:${entry.semesterNumber}`;
      const bucket = byStudentSem.get(key) ?? [];
      bucket.push(entry);
      byStudentSem.set(key, bucket);
    }

    const ranked: { studentProfileId: string; fullName: string; semesterNumber: number; sgpa: number; gradeBadge: string }[] = [];
    for (const student of students) {
      const semesters = [...new Set(entries.filter((e) => e.studentProfileId === student.id).map((e) => e.semesterNumber))];
      for (const semesterNumber of semesters) {
        const rows = byStudentSem.get(`${student.id}:${semesterNumber}`) ?? [];
        const sgpa = computeSemesterSgpa(rows);
        if (sgpa == null) continue;
        ranked.push({
          studentProfileId: student.id,
          fullName: student.user.fullName,
          semesterNumber,
          sgpa,
          gradeBadge: sgpaToGradeBadge(sgpa)
        });
      }
    }

    ranked.sort((a, b) => b.sgpa - a.sgpa || a.fullName.localeCompare(b.fullName));
    const items = ranked.slice(0, limit).map((row) => ({
      studentProfileId: row.studentProfileId,
      fullName: row.fullName,
      semesterLabel: `Sem ${row.semesterNumber}`,
      gradeBadge: row.gradeBadge,
      sgpa: row.sgpa
    }));
    return { items, total: ranked.length };
  }

  private async listNeedAttention(user: AuthUser, sectionId: string, limit: number) {
    const scope = await this.scopeForSectionId(sectionId);
    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      include: { user: { select: { fullName: true } } }
    });
    if (!students.length) return { items: [], total: 0 };

    const studentIds = students.map((s) => s.id);
    const [entries, attendanceRows, feeRows] = await Promise.all([
      this.permissions.can(user, { action: PermissionAction.VIEW_RESULTS, scope }).allowed
        ? this.prisma.resultEntry.findMany({
            where: { studentProfileId: { in: studentIds }, isPublished: true },
            select: { studentProfileId: true, semesterNumber: true, grade: true, credits: true, status: true }
          })
        : Promise.resolve([]),
      this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE, scope }).allowed
        ? this.prisma.attendanceEntry.groupBy({
            by: ["studentProfileId", "status"],
            where: { studentProfileId: { in: studentIds }, session: { sectionId } },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope }).allowed
        ? this.loadFeeBalances(sectionId)
        : Promise.resolve(new Map<string, number>())
    ]);

    const attendanceByStudent = new Map<string, { present: number; total: number }>();
    for (const row of attendanceRows) {
      const current = attendanceByStudent.get(row.studentProfileId) ?? { present: 0, total: 0 };
      current.total += row._count._all;
      if (row.status === AttendanceEntryStatus.PRESENT) current.present += row._count._all;
      attendanceByStudent.set(row.studentProfileId, current);
    }

    const flagged: {
      studentProfileId: string;
      fullName: string;
      semesterLabel: string;
      gradeBadge: string;
      reasons: string[];
      sortKey: number;
    }[] = [];

    for (const student of students) {
      const reasons: string[] = [];
      let worstSgpa: number | null = null;
      let worstSemester = 0;

      const semNumbers = [...new Set(entries.filter((e) => e.studentProfileId === student.id).map((e) => e.semesterNumber))];
      for (const sem of semNumbers) {
        const semRows = entries.filter((e) => e.studentProfileId === student.id && e.semesterNumber === sem);
        const sgpa = computeSemesterSgpa(semRows);
        if (sgpa != null && sgpa < this.thresholds.sgpaMin) {
          reasons.push("low_academic");
          if (worstSgpa == null || sgpa < worstSgpa) {
            worstSgpa = sgpa;
            worstSemester = sem;
          }
        }
      }

      const att = attendanceByStudent.get(student.id);
      if (att && att.total > 0) {
        const pct = Math.round((att.present / att.total) * 100);
        if (pct < this.thresholds.attendancePercentMin) {
          reasons.push("low_attendance");
          if (!worstSemester) worstSemester = 0;
        }
      }

      const balance = feeRows.get(student.id) ?? 0;
      if (balance > 0) reasons.push("fee_dues");

      if (!reasons.length) continue;

      const semesterLabel = worstSemester ? `Sem ${worstSemester}` : "Current";
      flagged.push({
        studentProfileId: student.id,
        fullName: student.user.fullName,
        semesterLabel,
        gradeBadge: worstSgpa != null ? sgpaToGradeBadge(worstSgpa) : balance > 0 ? "—" : "F",
        reasons: [...new Set(reasons)],
        sortKey: worstSgpa ?? 0
      });
    }

    flagged.sort((a, b) => a.sortKey - b.sortKey || a.fullName.localeCompare(b.fullName));
    const items = flagged.slice(0, limit).map(({ sortKey: _sortKey, ...row }) => row);
    return { items, total: flagged.length };
  }

  private async passRateForSection(user: AuthUser, scope: ScopeRef, sectionId: string) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_RESULTS, scope }).allowed) return 0;
    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    if (!students.length) return 0;
    const ids = students.map((s) => s.id);
    const [pass, total] = await Promise.all([
      this.prisma.resultEntry.count({
        where: { studentProfileId: { in: ids }, isPublished: true, status: ResultEntryStatus.PASS }
      }),
      this.prisma.resultEntry.count({
        where: { studentProfileId: { in: ids }, isPublished: true, status: { in: [ResultEntryStatus.PASS, ResultEntryStatus.FAIL, ResultEntryStatus.ABSENT] } }
      })
    ]);
    return total ? Math.round((pass / total) * 100) : 0;
  }

  private async attendancePercentForSection(user: AuthUser, scope: ScopeRef, sectionId: string) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE, scope }).allowed) return 0;
    const [present, total] = await Promise.all([
      this.prisma.attendanceEntry.count({
        where: { status: AttendanceEntryStatus.PRESENT, session: { sectionId } }
      }),
      this.prisma.attendanceEntry.count({ where: { session: { sectionId } } })
    ]);
    return total ? Math.round((present / total) * 100) : 0;
  }

  private async feeCollectionForSection(user: AuthUser, scope: ScopeRef, sectionId: string) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope }).allowed) return 0;
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        student: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: { payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }, feeStructure: { select: { amount: true } } }
    });
    let target = 0;
    let paid = 0;
    for (const row of assignments) {
      target += Number(row.feeStructure.amount);
      paid += row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    }
    return target > 0 ? Math.round((paid / target) * 100) : 0;
  }

  /** Resolve which of the given sections the user may see for an action, in ONE query. */
  private async allowedSectionIds(user: AuthUser, sectionIds: string[], action: PermissionAction): Promise<string[]> {
    if (!sectionIds.length) return [];
    const sections = await this.prisma.section.findMany({
      where: { id: { in: sectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: this.sectionInclude
    });
    return sections
      .filter((section) => this.permissions.can(user, { action, scope: this.sectionToScope(section) }).allowed)
      .map((section) => section.id);
  }

  private async passRateForSections(user: AuthUser, sectionIds: string[]) {
    // Batched: resolve allowed sections (1 query), load their students (1 query),
    // then aggregate result counts across all of them (2 queries) — no per-section N+1.
    const allowed = await this.allowedSectionIds(user, sectionIds, PermissionAction.VIEW_RESULTS);
    if (!allowed.length) return 0;
    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId: { in: allowed }, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    if (!students.length) return 0;
    const ids = students.map((s) => s.id);
    const [pass, total] = await Promise.all([
      this.prisma.resultEntry.count({
        where: { studentProfileId: { in: ids }, isPublished: true, status: ResultEntryStatus.PASS }
      }),
      this.prisma.resultEntry.count({
        where: {
          studentProfileId: { in: ids },
          isPublished: true,
          status: { in: [ResultEntryStatus.PASS, ResultEntryStatus.FAIL, ResultEntryStatus.ABSENT] }
        }
      })
    ]);
    return total ? Math.round((pass / total) * 100) : 0;
  }

  private async attendancePercentForSections(user: AuthUser, sectionIds: string[]) {
    const allowed = await this.allowedSectionIds(user, sectionIds, PermissionAction.VIEW_ATTENDANCE);
    if (!allowed.length) return 0;
    const [present, total] = await Promise.all([
      this.prisma.attendanceEntry.count({
        where: { status: AttendanceEntryStatus.PRESENT, session: { sectionId: { in: allowed } } }
      }),
      this.prisma.attendanceEntry.count({ where: { session: { sectionId: { in: allowed } } } })
    ]);
    return total ? Math.round((present / total) * 100) : 0;
  }

  private async feeCollectionForSections(user: AuthUser, sectionIds: string[]) {
    const allowed = await this.allowedSectionIds(user, sectionIds, PermissionAction.VIEW_FEES);
    if (!allowed.length) return 0;
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        student: { sectionId: { in: allowed }, currentStatus: UserStatus.ACTIVE, isArchived: false },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } },
        feeStructure: { select: { amount: true } }
      }
    });
    let target = 0;
    let paid = 0;
    for (const row of assignments) {
      target += Number(row.feeStructure.amount);
      paid += row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    }
    return target > 0 ? Math.round((paid / target) * 100) : 0;
  }

  private async loadFeeBalances(sectionId: string) {
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        student: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } },
        feeStructure: { select: { amount: true } }
      }
    });
    const byStudent = new Map<string, { total: number; paid: number }>();
    for (const row of assignments) {
      const amount = Number(row.feeStructure.amount);
      const paid = row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const existing = byStudent.get(row.studentId) ?? { total: 0, paid: 0 };
      existing.total += amount;
      existing.paid += paid;
      byStudent.set(row.studentId, existing);
    }
    const balances = new Map<string, number>();
    for (const [studentId, agg] of byStudent) {
      balances.set(studentId, Math.max(agg.total - agg.paid, 0));
    }
    return balances;
  }

  private async buildAttendanceExportRows(sectionId: string) {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { sectionId },
      include: { subject: true, entries: { include: { studentProfile: { include: { user: true } } } } },
      orderBy: [{ attendanceDate: "desc" }],
      take: 500
    });
    const rows: (string | number)[][] = [["Date", "Subject", "Roll no", "Student", "Status"]];
    for (const session of sessions) {
      for (const entry of session.entries) {
        rows.push([
          formatIstDate(new Date(session.attendanceDate)),
          session.subject?.name ?? "General",
          entry.studentProfile.rollNumber,
          entry.studentProfile.user.fullName,
          entry.status
        ]);
      }
    }
    return rows;
  }

  private async buildGradesExportRows(sectionId: string) {
    const entries = await this.prisma.resultEntry.findMany({
      where: { isPublished: true, studentProfile: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false } },
      include: { subject: true, studentProfile: { include: { user: true } } },
      orderBy: [{ semesterNumber: "asc" }, { studentProfile: { rollNumber: "asc" } }],
      take: 2000
    });
    return [
      ["Roll no", "Student", "Semester", "Subject", "Grade", "Status"],
      ...entries.map((e) => [
        e.studentProfile.rollNumber,
        e.studentProfile.user.fullName,
        e.semesterNumber,
        e.subject.name,
        e.grade ?? "",
        e.status
      ])
    ];
  }

  private async buildFinanceExportRows(sectionId: string) {
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        student: { sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        feeStructure: true,
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } },
        student: { include: { user: true } }
      }
    });
    const byStudent = new Map<
      string,
      { rollNumber: string; fullName: string; total: number; paid: number }
    >();
    for (const row of assignments) {
      const amount = Number(row.feeStructure.amount);
      const paid = row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const existing = byStudent.get(row.studentId);
      if (existing) {
        existing.total += amount;
        existing.paid += paid;
      } else {
        byStudent.set(row.studentId, {
          rollNumber: row.student.rollNumber,
          fullName: row.student.user.fullName,
          total: amount,
          paid
        });
      }
    }
    return [
      ["Roll no", "Student", "Total fee", "Paid", "Balance", "Status"],
      ...[...byStudent.values()].map((row) => {
        const balance = Math.max(row.total - row.paid, 0);
        return [row.rollNumber, row.fullName, row.total, row.paid, balance, deriveFeeStatus(row.total, row.paid)];
      })
    ];
  }

  private adminQueryToScope(query: PortalReportsScopeQueryDto): ScopeRef {
    return {
      campusId: query.campusId,
      programId: query.programId,
      branchId: query.branchId,
      batchId: query.batchId,
      classId: query.classId,
      sectionId: query.sectionId
    };
  }

  private resolveAdminScope(user: AuthUser, query: PortalReportsScopeQueryDto): ScopeRef {
    const queryScope = this.adminQueryToScope(query);
    const hasQueryScope = Object.values(queryScope).some(Boolean);

    if (isInstitutionWideAdmin(user)) {
      return hasQueryScope ? queryScope : {};
    }

    if (user.campusId) {
      if (hasQueryScope) {
        if (queryScope.campusId && queryScope.campusId !== user.campusId) {
          throw new ForbiddenException("Campus is outside your allowed scope.");
        }
        return queryScope.campusId ? queryScope : { ...queryScope, campusId: user.campusId };
      }
      return { campusId: user.campusId };
    }

    if (user.campusGroupId) {
      if (hasQueryScope) {
        return { ...queryScope, campusGroupId: user.campusGroupId };
      }
      return { campusGroupId: user.campusGroupId };
    }

    return hasQueryScope ? queryScope : {};
  }

  private adminDefaultScope(user: AuthUser): ScopeRef {
    if (isInstitutionWideAdmin(user)) return {};
    if (user.campusId) return { campusId: user.campusId };
    if (user.campusGroupId) return { campusGroupId: user.campusGroupId };
    return {};
  }

  private async scopeForSectionId(sectionId: string): Promise<ScopeRef> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId },
      include: this.sectionInclude
    });
    if (!section) return { sectionId };
    return this.sectionToScope(section);
  }

  private sectionsWhereFromScope(scope: ScopeRef): Prisma.SectionWhereInput {
    const base: Prisma.SectionWhereInput = { isArchived: false, status: StructureStatus.ACTIVE };
    if (scope.sectionId) return { ...base, id: scope.sectionId };
    if (scope.classId) return { ...base, classId: scope.classId };
    if (scope.batchId) return { ...base, class: { batchId: scope.batchId, isArchived: false, status: StructureStatus.ACTIVE } };
    if (scope.branchId) {
      return {
        ...base,
        class: { batch: { branchId: scope.branchId, status: StructureStatus.ACTIVE }, isArchived: false, status: StructureStatus.ACTIVE }
      };
    }
    if (scope.programId) {
      return {
        ...base,
        class: {
          batch: { branch: { programId: scope.programId, status: StructureStatus.ACTIVE }, status: StructureStatus.ACTIVE },
          isArchived: false,
          status: StructureStatus.ACTIVE
        }
      };
    }
    if (scope.campusId) return { ...base, campusId: scope.campusId };
    if (scope.campusGroupId) return { ...base, campus: { groupId: scope.campusGroupId } };
    return base;
  }

  private assertReportsAccess(user: AuthUser, scope: ScopeRef) {
    this.assertModuleAccess(user, PermissionAction.VIEW_REPORTS, scope);
  }

  private assertModuleAccess(user: AuthUser, action: PermissionAction, scope: ScopeRef) {
    const allowed = this.permissions.can(user, { action, scope }).allowed;
    if (!allowed) throw new ForbiddenException("You do not have permission for this report scope.");
  }

  private sectionIdToScope(sectionId: string): ScopeRef {
    return { sectionId };
  }

  private async auditFilterUsage(user: AuthUser, query: PortalReportsScopeQueryDto, ctx: ReportsContext) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.auditUserId,
        action: "REPORT_FILTER",
        entity: "ReportsDashboard",
        entityId: ctx.primarySectionId,
        metadata: {
          mode: ctx.mode,
          sectionId: query.sectionId ?? ctx.primarySectionId,
          programId: query.programId ?? null,
          branchId: query.branchId ?? null,
          batchId: query.batchId ?? null,
          classId: query.classId ?? null
        } as Prisma.InputJsonObject
      }
    });
  }

  private async getActiveTeacher(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, sectionId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    return teacher;
  }

  private sectionsWhereForHtpo(
    assignments: { campusId: string | null; programId: string | null; branchId: string | null }[]
  ): Prisma.SectionWhereInput {
    const OR = assignments.map((a) => ({
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(a.campusId ? { campusId: a.campusId } : {}),
      class: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        batch: {
          status: StructureStatus.ACTIVE,
          branch: {
            status: StructureStatus.ACTIVE,
            isArchived: false,
            ...(a.branchId ? { id: a.branchId } : {}),
            ...(a.programId ? { programId: a.programId } : {})
          }
        }
      }
    }));
    return OR.length ? { OR } : { id: "__none__" };
  }

  private sectionLabel(section: SectionTree) {
    const program = section.class.batch.branch.program;
    const programShort = program.name.replace(/^B\.?Tech\s*/i, "B.Tech ");
    return `${programShort} · Sem ${section.class.semesterNumber} · ${section.name}`;
  }

  private sectionToScope(section: SectionTree): ScopeRef {
    return {
      campusId: section.campusId,
      programId: section.class.batch.branch.programId,
      branchId: section.class.batch.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id
    };
  }

  private readonly sectionInclude = {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
  } satisfies Prisma.SectionInclude;
}

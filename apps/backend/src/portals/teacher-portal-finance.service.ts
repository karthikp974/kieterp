import { formatIstDate } from "../common/ist-time.util";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  FeePaymentStatus,
  PermissionAction,
  Prisma,
  StructureStatus,
  StudentPortalNotificationKind,
  TeacherRoleKind,
  UserStatus,
  UserType
} from "@prisma/client";
import { Response } from "express";
import { AuthUser } from "../auth/auth.types";
import { computeFeeOverdue, type FeeOverdueStatus } from "../common/fee-overdue.util";
import { toPagination } from "../common/pagination.dto";
import { sendTabularExport } from "../common/tabular-export.util";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  TeacherFinanceExportQueryDto,
  TeacherFinancePendingStudentsQueryDto,
  TeacherFinanceRecentPaymentsQueryDto,
  TeacherFinanceScopeQueryDto,
  TeacherFinanceStudentsQueryDto,
  type FeeUiStatusFilter
} from "./teacher-finance-portal.dto";
import {
  currentAcademicYearWindow,
  deriveFeeStatus,
  formatInrCompact,
  formatInrFull,
  sanitizeExportFilename,
  type FeeUiStatus
} from "./teacher-portal-finance.util";

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
  };
}>;

type StudentFeeAggregate = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
  sectionId: string;
  sectionLabel: string;
  totalFeeRupees: number;
  paidRupees: number;
  balanceRupees: number;
  status: FeeUiStatus;
  /** Computed on read: "paid" | "pending" | "overdue" (overdue if any unpaid fee is past due). */
  feeStatus: FeeOverdueStatus;
  /** Worst (max) days overdue across the student's unpaid fees; 0 unless overdue. */
  daysOverdue: number;
};

@Injectable()
export class TeacherPortalFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async getSetup(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    const teacher = await this.getActiveTeacher(user.id);
    const roles = [...new Set(teacher.assignments.map((a) => a.role))];
    const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
    const hasCtpo = roles.includes(TeacherRoleKind.CTPO);
    const mode = hasHtpo ? "htpo" : hasCtpo ? "ctpo" : "teacher";
    const sections = await this.loadFinanceSections(user, teacher);

    return {
      mode,
      roles,
      showSectionFilter: hasHtpo,
      showSectionCollection: hasHtpo,
      sections,
      fixedSectionId: !hasHtpo && hasCtpo && sections.length === 1 ? sections[0]?.id ?? null : null,
      totalFeesLabel: hasHtpo ? "Your sections wide" : "Section wide"
    };
  }

  async getSummary(user: AuthUser, query: TeacherFinanceScopeQueryDto) {
    const ctx = await this.resolveContext(user, query.sectionId);
    const aggregates = await this.loadStudentAggregates(ctx.sectionIds);
    const academicYear = currentAcademicYearWindow();
    const totalFeesRupees = aggregates.reduce((sum, row) => sum + row.totalFeeRupees, 0);
    const collectedRupees = await this.sumCollectedInAcademicYear(ctx.sectionIds, academicYear);
    const pendingRupees = Math.max(totalFeesRupees - collectedRupees, 0);
    const collectionRate = totalFeesRupees > 0 ? Math.round((collectedRupees / totalFeesRupees) * 100) : 0;

    return {
      totalFees: {
        amountRupees: totalFeesRupees,
        label: ctx.totalFeesLabel,
        display: formatInrCompact(totalFeesRupees)
      },
      collected: {
        amountRupees: collectedRupees,
        display: formatInrCompact(collectedRupees),
        collectionRate
      },
      pending: {
        amountRupees: pendingRupees,
        display: formatInrCompact(pendingRupees),
        hint: "Outstanding"
      },
      sections: {
        count: ctx.sectionIds.length,
        hint: "Under your supervision"
      },
      academicYear: {
        start: formatIstDate(academicYear.start),
        end: formatIstDate(academicYear.end)
      }
    };
  }

  async listRecentPayments(user: AuthUser, query: TeacherFinanceRecentPaymentsQueryDto) {
    const ctx = await this.resolveContext(user, query.sectionId);
    const pagination = toPagination({ ...query, pageSize: query.pageSize ?? 15 });
    const where: Prisma.FeePaymentWhereInput = {
      status: FeePaymentStatus.ACTIVE,
      studentProfile: {
        sectionId: { in: ctx.sectionIds },
        currentStatus: UserStatus.ACTIVE,
        isArchived: false
      }
    };

    const [payments, total] = await Promise.all([
      this.prisma.feePayment.findMany({
        where,
        include: {
          studentProfile: {
            include: {
              user: { select: { fullName: true } },
              section: { include: this.sectionInclude }
            }
          },
          studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
          feeHead: true
        },
        orderBy: { paidAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feePayment.count({ where })
    ]);

    return {
      items: payments.map((payment) => {
        const amountRupees = Number(payment.amount);
        const assignment = payment.studentFeeAssignment;
        const assignmentAmount = assignment ? Number(assignment.feeStructure.amount) : amountRupees;
        const status: FeeUiStatus =
          assignment?.paymentStatus === "PAID"
            ? "paid"
            : assignment?.paymentStatus === "PARTIAL"
              ? "partial"
              : deriveFeeStatus(assignmentAmount, amountRupees);
        const feeType =
          payment.studentFeeAssignment?.feeStructure.feeHeadName ??
          payment.studentFeeAssignment?.feeStructure.feeHead.name ??
          payment.feeHead.name;

        return {
          id: payment.id,
          fullName: payment.studentProfile.user.fullName,
          rollNumber: payment.studentProfile.rollNumber,
          sectionLabel: this.sectionLabel(payment.studentProfile.section as SectionTree),
          feeType,
          feePaidRupees: amountRupees,
          feePaidDisplay: formatInrFull(amountRupees),
          status,
          paidAt: payment.paidAt.toISOString()
        };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async listPendingStudents(user: AuthUser, query: TeacherFinancePendingStudentsQueryDto) {
    const ctx = await this.resolveContext(user, query.sectionId);
    const aggregates = (await this.loadStudentAggregates(ctx.sectionIds)).filter((row) => row.balanceRupees > 0);
    const pagination = toPagination({ ...query, pageSize: query.pageSize ?? 15 });
    const total = aggregates.length;
    const pageItems = aggregates.slice(pagination.skip, pagination.skip + pagination.take);

    return {
      items: pageItems.map((row) => ({
        studentProfileId: row.studentProfileId,
        rollNumber: row.rollNumber,
        fullName: row.fullName,
        sectionLabel: row.sectionLabel,
        totalFeeRupees: row.totalFeeRupees,
        paidRupees: row.paidRupees,
        balanceRupees: row.balanceRupees,
        totalFeeDisplay: formatInrFull(row.totalFeeRupees),
        paidDisplay: formatInrFull(row.paidRupees),
        balanceDisplay: formatInrFull(row.balanceRupees),
        status: row.status
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async listStudentFeeStatus(user: AuthUser, query: TeacherFinanceStudentsQueryDto) {
    const ctx = await this.resolveContext(user, query.sectionId);
    let aggregates = await this.loadStudentAggregates(ctx.sectionIds);

    // "overdue" filters on the computed status; paid/partial/pending on the base status.
    if (query.status === "overdue") {
      aggregates = aggregates.filter((row) => row.feeStatus === "overdue");
    } else if (query.status && query.status !== "all") {
      aggregates = aggregates.filter((row) => row.status === query.status);
    }

    // Search by roll number or name — only over the already scope-bounded students.
    const search = query.search?.trim().toLowerCase();
    if (search) {
      aggregates = aggregates.filter(
        (row) => row.rollNumber.toLowerCase().includes(search) || row.fullName.toLowerCase().includes(search)
      );
    }

    const pagination = toPagination({ ...query, pageSize: query.pageSize ?? 8 });
    const total = aggregates.length;
    const pageItems = aggregates.slice(pagination.skip, pagination.skip + pagination.take);

    return {
      items: pageItems.map((row) => ({
        studentProfileId: row.studentProfileId,
        rollNumber: row.rollNumber,
        fullName: row.fullName,
        sectionLabel: row.sectionLabel,
        totalFeeRupees: row.totalFeeRupees,
        paidRupees: row.paidRupees,
        balanceRupees: row.balanceRupees,
        totalFeeDisplay: formatInrFull(row.totalFeeRupees),
        paidDisplay: formatInrFull(row.paidRupees),
        balanceDisplay: formatInrFull(row.balanceRupees),
        status: row.status,
        feeStatus: row.feeStatus,
        daysOverdue: row.daysOverdue,
        canRemind: row.status === "pending" || row.status === "partial"
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async getSectionCollection(user: AuthUser, query: TeacherFinanceScopeQueryDto) {
    const teacher = await this.getActiveTeacher(user.id);
    const hasHtpo = teacher.assignments.some((a) => a.role === TeacherRoleKind.HTPO);
    if (!hasHtpo) throw new ForbiddenException("Section-wise collection is available for HTPO only.");

    const ctx = await this.resolveContext(user, query.sectionId);
    const sections = await this.prisma.section.findMany({
      where: { id: { in: ctx.sectionIds } },
      include: this.sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    const items = await Promise.all(
      sections.map(async (section) => {
        const aggregates = await this.loadStudentAggregates([section.id]);
        const targetRupees = aggregates.reduce((sum, row) => sum + row.totalFeeRupees, 0);
        const collectedRupees = aggregates.reduce((sum, row) => sum + row.paidRupees, 0);
        const percent = targetRupees > 0 ? Math.round((collectedRupees / targetRupees) * 100) : 0;
        return {
          sectionId: section.id,
          label: this.sectionLabel(section),
          targetRupees,
          collectedRupees,
          percent,
          targetDisplay: formatInrFull(targetRupees),
          collectedDisplay: formatInrFull(collectedRupees)
        };
      })
    );

    return { items };
  }

  async getPaymentStatusBreakdown(user: AuthUser, query: TeacherFinanceScopeQueryDto) {
    const ctx = await this.resolveContext(user, query.sectionId);
    const aggregates = await this.loadStudentAggregates(ctx.sectionIds);
    const totalStudents = aggregates.length || 1;
    const counts = { paid: 0, partial: 0, pending: 0 };
    for (const row of aggregates) counts[row.status] += 1;

    const toItem = (key: FeeUiStatus, count: number) => ({
      status: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      studentCount: count,
      percent: Math.round((count / totalStudents) * 100)
    });

    return {
      totalStudents: aggregates.length,
      items: [toItem("paid", counts.paid), toItem("partial", counts.partial), toItem("pending", counts.pending)]
    };
  }

  async exportStudentFeeStatus(user: AuthUser, query: TeacherFinanceExportQueryDto, response: Response) {
    const ctx = await this.resolveContext(user, query.sectionId);
    let aggregates = await this.loadStudentAggregates(ctx.sectionIds);
    if (query.status === "overdue") {
      aggregates = aggregates.filter((row) => row.feeStatus === "overdue");
    } else if (query.status && query.status !== "all") {
      aggregates = aggregates.filter((row) => row.status === query.status);
    }

    const sectionLabel =
      query.sectionId && ctx.sections.length
        ? ctx.sections.find((s) => s.id === query.sectionId)?.label ?? "All-sections"
        : "All-sections";
    const statusLabel = query.status === "all" ? "All-statuses" : query.status;
    const filename = sanitizeExportFilename(`${sectionLabel}-${statusLabel}`);
    const title = `Student fee status — ${sectionLabel} — ${statusLabel}`;

    const rows: (string | number)[][] = [
      ["Roll no", "Name", "Section", "Total fee", "Paid", "Balance", "Status"],
      ...aggregates.map((row) => [
        row.rollNumber,
        row.fullName,
        row.sectionLabel,
        row.totalFeeRupees,
        row.paidRupees,
        row.balanceRupees,
        row.status
      ])
    ];

    const format = query.format;
    await sendTabularExport(response, format, filename, title, rows);
  }

  async remindStudent(user: AuthUser, studentProfileId: string) {
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      include: {
        user: { select: { id: true, fullName: true } },
        section: { include: this.sectionInclude }
      }
    });
    if (!student) throw new NotFoundException("Student not found.");

    const allowed = this.permissions.can(user, {
      action: PermissionAction.VIEW_FEES,
      scope: this.sectionToScope(student.section as SectionTree)
    }).allowed;
    if (!allowed) throw new ForbiddenException("You cannot remind this student.");

    const aggregates = await this.loadStudentAggregates([student.sectionId]);
    const row = aggregates.find((item) => item.studentProfileId === studentProfileId);
    if (!row || row.balanceRupees <= 0) {
      throw new BadRequestException("This student has no outstanding fee balance.");
    }

    const body = `You need to pay fees. Outstanding balance: ${formatInrFull(row.balanceRupees)}. Open Fee Status in your student portal to review and pay.`;
    await this.prisma.studentPortalNotification.create({
      data: {
        userId: student.user.id,
        kind: StudentPortalNotificationKind.SYSTEM,
        title: "Fee payment reminder",
        body
      }
    });

    return { ok: true, studentProfileId, balanceRupees: row.balanceRupees };
  }

  private async resolveContext(user: AuthUser, sectionId?: string) {
    const teacher = await this.getActiveTeacher(user.id);
    const sections = await this.loadFinanceSections(user, teacher);
    if (!sections.length) {
      return {
        sectionIds: [] as string[],
        sections: [] as { id: string; label: string }[],
        totalFeesLabel: "Your sections wide"
      };
    }

    const accessibleSectionIds = sections.map((s) => s.id);
    const trimmed = sectionId?.trim();
    if (trimmed && !accessibleSectionIds.includes(trimmed)) {
      throw new ForbiddenException("You cannot view finance for this section.");
    }

    const hasHtpo = teacher.assignments.some((a) => a.role === TeacherRoleKind.HTPO);
    const sectionIds = trimmed ? [trimmed] : accessibleSectionIds;

    return {
      sectionIds,
      sections,
      totalFeesLabel: hasHtpo ? "Your sections wide" : "Section wide"
    };
  }

  private async loadStudentAggregates(sectionIds: string[]): Promise<StudentFeeAggregate[]> {
    if (!sectionIds.length) return [];

    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        student: {
          sectionId: { in: sectionIds },
          currentStatus: UserStatus.ACTIVE,
          isArchived: false
        },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        feeStructure: { include: { feeHead: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } },
        student: {
          include: {
            user: { select: { fullName: true } },
            section: { include: this.sectionInclude }
          }
        }
      }
    });

    const byStudent = new Map<string, StudentFeeAggregate>();
    for (const assignment of assignments) {
      const amountRupees = Number(assignment.feeStructure.amount);
      const paidRupees = assignment.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      // Per-fee overdue: this fee's own balance against its own due date.
      const feeBalance = Math.max(amountRupees - paidRupees, 0);
      const overdue = computeFeeOverdue(feeBalance, assignment.feeStructure.dueDate);
      const existing = byStudent.get(assignment.studentId);
      if (existing) {
        existing.totalFeeRupees += amountRupees;
        existing.paidRupees += paidRupees;
        existing.balanceRupees = Math.max(existing.totalFeeRupees - existing.paidRupees, 0);
        existing.status = deriveFeeStatus(existing.totalFeeRupees, existing.paidRupees);
        existing.daysOverdue = Math.max(existing.daysOverdue, overdue.daysOverdue);
      } else {
        const section = assignment.student.section as SectionTree;
        byStudent.set(assignment.studentId, {
          studentProfileId: assignment.studentId,
          rollNumber: assignment.student.rollNumber,
          fullName: assignment.student.user.fullName,
          sectionId: assignment.student.sectionId,
          sectionLabel: this.sectionLabel(section),
          totalFeeRupees: amountRupees,
          paidRupees,
          balanceRupees: Math.max(amountRupees - paidRupees, 0),
          status: deriveFeeStatus(amountRupees, paidRupees),
          feeStatus: "pending",
          daysOverdue: overdue.daysOverdue
        });
      }
    }

    // Roll up the per-student overdue status: paid if nothing outstanding, overdue if any
    // unpaid fee is past due (daysOverdue > 0), else pending.
    for (const row of byStudent.values()) {
      row.feeStatus = row.balanceRupees <= 0 ? "paid" : row.daysOverdue > 0 ? "overdue" : "pending";
      if (row.feeStatus !== "overdue") row.daysOverdue = 0;
    }

    return [...byStudent.values()].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  }

  private async sumCollectedInAcademicYear(
    sectionIds: string[],
    academicYear: ReturnType<typeof currentAcademicYearWindow>
  ) {
    if (!sectionIds.length) return 0;
    const aggregate = await this.prisma.feePayment.aggregate({
      where: {
        status: FeePaymentStatus.ACTIVE,
        paidAt: { gte: academicYear.start, lte: academicYear.end },
        studentProfile: {
          sectionId: { in: sectionIds },
          currentStatus: UserStatus.ACTIVE,
          isArchived: false
        }
      },
      _sum: { amount: true }
    });
    return Number(aggregate._sum.amount ?? 0);
  }

  private async loadFinanceSections(user: AuthUser, teacher: Awaited<ReturnType<typeof this.getActiveTeacher>>) {
    const sectionMap = new Map<string, { id: string; label: string }>();
    const hasHtpo = teacher.assignments.some((a) => a.role === TeacherRoleKind.HTPO);

    if (hasHtpo) {
      const sections = await this.prisma.section.findMany({
        where: this.sectionsWhereForHtpo(teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO)),
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section) });
        }
      }
    }

    const ctpoSectionIds = [
      ...new Set(
        teacher.assignments.filter((a) => a.role === TeacherRoleKind.CTPO && a.sectionId).map((a) => a.sectionId!)
      )
    ];
    if (ctpoSectionIds.length) {
      const sections = await this.prisma.section.findMany({
        where: { id: { in: ctpoSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section) });
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

  private sectionLabel(section: SectionTree) {
    const program = section.class.batch.branch.program;
    const programShort = program.name.replace(/^B\.?Tech\s*/i, "B.Tech ");
    return `${programShort} · Sem ${section.class.semesterNumber} · ${section.name}`;
  }

  private sectionToScope(section: SectionTree) {
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

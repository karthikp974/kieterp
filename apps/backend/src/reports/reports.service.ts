import { ForbiddenException, Injectable } from "@nestjs/common";
import { formatIstDate, istDayRangeFromIso, parseIstDateOnly } from "../common/ist-time.util";
import { AttendanceEntryStatus, FeePaymentStatus, PermissionAction, Prisma, ResultEntryStatus, StudentApplicationStatus, UserStatus, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { sendTabularExport } from "../common/tabular-export.util";
import { buildExportBasename } from "../common/export-filename.util";
import { PermissionsService } from "../permissions/permissions.service";
import { isInstitutionWideAdmin } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import { DASHBOARD_CACHE_TTL_SECONDS, REPORTS_SUMMARY_CACHE_PREFIX } from "../cache/cache.constants";
import { ReportsExportQueryDto, ReportsQueryDto } from "./reports.dto";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly sharedGroup: SharedGroupAcademicService,
    private readonly cache: CacheService
  ) {}

  async summary(user: AuthUser, query: ReportsQueryDto) {
    const scope = this.resolveScope(user, query);
    // Authorize BEFORE serving cached data, then cache the heavy aggregation (45s TTL).
    this.assertAllowed(user, PermissionAction.VIEW_REPORTS, scope);
    const key = `${REPORTS_SUMMARY_CACHE_PREFIX}${JSON.stringify(scope)}:${JSON.stringify(query ?? {})}`;
    return this.cache.getOrSet(key, DASHBOARD_CACHE_TTL_SECONDS, async () => {
      const [students, attendance, finance, results, applications] = await Promise.all([
        this.studentSummary(scope),
        this.attendanceSummary(user, query, scope),
        this.financeSummary(user, query, scope),
        this.resultsSummary(user, scope),
        this.applicationSummary(user, scope)
      ]);
      return { scope, students, attendance, finance, results, applications };
    });
  }

  async attendance(user: AuthUser, query: ReportsQueryDto) {
    const scope = this.resolveScope(user, query);
    this.assertAllowed(user, PermissionAction.VIEW_ATTENDANCE, scope);
    const pagination = toPagination(query);
    const where = this.attendanceWhere(query, scope);
    const [sessions, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        include: { section: true, subject: true, entries: true },
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.attendanceSession.count({ where })
    ]);
    const items = sessions.map((session) => {
      const present = session.entries.filter((entry) => entry.status === AttendanceEntryStatus.PRESENT).length;
      const totalEntries = session.entries.length;
      return {
        id: session.id,
        date: session.attendanceDate,
        section: session.section.name,
        subject: session.subject?.name ?? "General",
        total: totalEntries,
        present,
        absent: totalEntries - present,
        percentage: totalEntries ? Math.round((present / totalEntries) * 10000) / 100 : 0
      };
    });
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async applications(user: AuthUser, query: ReportsQueryDto) {
    const scope = this.resolveScope(user, query);
    this.assertAllowed(user, PermissionAction.VIEW_APPLICATIONS, scope);
    const pagination = toPagination(query);
    const where: Prisma.StudentApplicationWhereInput = {
      studentProfile: this.studentProfileRelationWhere(scope),
      createdAt: this.createdAtRange(query)
    };
    const [items, total, byStatus] = await Promise.all([
      this.prisma.studentApplication.findMany({
        where,
        include: {
          studentProfile: { include: { user: true, section: true } }
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentApplication.count({ where }),
      this.prisma.studentApplication.groupBy({
        by: ["status"],
        where,
        _count: { _all: true }
      })
    ]);
    const statusCounts = byStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});
    return {
      summary: {
        total,
        pending: statusCounts.PENDING ?? 0,
        inReview: statusCounts.IN_REVIEW ?? 0,
        approved: statusCounts.APPROVED ?? 0,
        rejected: statusCounts.REJECTED ?? 0,
        closed: statusCounts.CLOSED ?? 0
      },
      items: items.map((item) => ({
        id: item.id,
        category: item.category,
        subject: item.subject,
        status: item.status,
        createdAt: item.createdAt,
        student: item.studentProfile.user.fullName,
        rollNumber: item.studentProfile.rollNumber,
        section: item.studentProfile.section.name
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async finance(user: AuthUser, query: ReportsQueryDto) {
    const scope = this.resolveScope(user, query);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, scope);
    const payments = await this.prisma.feePayment.findMany({
      where: {
        status: FeePaymentStatus.ACTIVE,
        studentProfile: this.studentProfileRelationWhere(scope),
        paidAt: this.paidAtRange(query)
      },
      include: { feeHead: true, studentFeeAssignment: { include: { feeStructure: true } }, studentProfile: { include: { user: true } } },
      orderBy: { paidAt: "desc" },
      take: 100
    });
    const byHead = payments.reduce<Record<string, { feeHead: string; amount: number; count: number }>>((acc, payment) => {
      const feeHeadLabel = payment.studentFeeAssignment?.feeStructure.feeHeadName ?? payment.feeHead.name;
      acc[payment.feeHeadId] = acc[payment.feeHeadId] ?? { feeHead: feeHeadLabel, amount: 0, count: 0 };
      acc[payment.feeHeadId].amount += Number(payment.amount);
      acc[payment.feeHeadId].count += 1;
      return acc;
    }, {});
    return {
      summary: { collected: payments.reduce((sum, payment) => sum + Number(payment.amount), 0), payments: payments.length },
      byHead: Object.values(byHead),
      recent: payments.slice(0, 25).map((payment) => ({ id: payment.id, receiptNo: payment.receiptNo, student: payment.studentProfile.user.fullName, feeHead: payment.studentFeeAssignment?.feeStructure.feeHeadName ?? payment.feeHead.name, amount: Number(payment.amount), paidAt: payment.paidAt }))
    };
  }

  async results(user: AuthUser, query: ReportsQueryDto) {
    const scope = this.resolveScope(user, query);
    this.assertAllowed(user, PermissionAction.VIEW_RESULTS, scope);
    const entries = await this.prisma.resultEntry.findMany({
      where: {
        studentProfile: this.studentProfileRelationWhere(scope),
        updatedAt: this.updatedAtRange(query)
      },
      include: { subject: true, studentProfile: { include: { user: true } } },
      orderBy: [{ semesterNumber: "asc" }, { updatedAt: "desc" }],
      take: 100
    });
    const byStatus = entries.reduce<Record<ResultEntryStatus, number>>(
      (acc, entry) => ({ ...acc, [entry.status]: acc[entry.status] + 1 }),
      { PASS: 0, FAIL: 0, ABSENT: 0, WITHHELD: 0 }
    );
    return {
      summary: { totalEntries: entries.length, ...byStatus },
      recentFailures: entries
        .filter((entry) => entry.status === ResultEntryStatus.FAIL || entry.status === ResultEntryStatus.ABSENT)
        .slice(0, 25)
        .map((entry) => ({ id: entry.id, rollNumber: entry.studentProfile.rollNumber, student: entry.studentProfile.user.fullName, subject: entry.subject.name, grade: entry.grade, status: entry.status }))
    };
  }

  async exportSummary(user: AuthUser, query: ReportsExportQueryDto, response: Response) {
    const data = await this.summary(user, query);
    const rows: (string | number)[][] = [
      ["Metric", "Value"],
      ["Active students", data.students.active],
      ["Attendance sessions", data.attendance.sessions],
      ["Attendance present", data.attendance.present],
      ["Attendance absent", data.attendance.absent],
      ["Attendance %", data.attendance.percentage],
      ["Fees collected (INR)", data.finance.collected],
      ["Fee payments", data.finance.payments],
      ["Result entries", data.results.totalEntries],
      ["Result fail/absent", data.results.failedOrAbsent],
      ["Pending applications", data.applications.pending],
      [],
      ["Date from", query.from ?? ""],
      ["Date to", query.to ?? ""]
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Reports", "InstitutionalOverview"),
      "Institutional overview report",
      rows
    );
  }

  async exportAttendance(user: AuthUser, query: ReportsExportQueryDto, response: Response) {
    const report = await this.attendance(user, { ...query, page: 1, pageSize: 500 });
    const rows: (string | number)[][] = [
      ["Date", "Section", "Subject", "Total", "Present", "Absent", "Percentage"],
      ...report.items.map((item) => [
        formatIstDate(new Date(item.date)),
        item.section,
        item.subject,
        item.total,
        item.present,
        item.absent,
        item.percentage
      ])
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Reports", "AttendanceSummary"),
      "Attendance report",
      rows
    );
  }

  async exportFinance(user: AuthUser, query: ReportsExportQueryDto, response: Response) {
    const report = await this.finance(user, query);
    const rows: (string | number)[][] = [
      ["Receipt", "Student", "Fee head", "Amount (INR)", "Paid at"],
      ...(report.recent ?? []).map((item) => [
        item.receiptNo,
        item.student,
        item.feeHead,
        item.amount,
        formatIstDate(new Date(item.paidAt))
      ])
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Reports", "FeeCollection"),
      "Finance report",
      rows
    );
  }

  async exportResults(user: AuthUser, query: ReportsExportQueryDto, response: Response) {
    const report = await this.results(user, query);
    const rows: (string | number)[][] = [
      ["Status", "Count"],
      ["Pass", report.summary.PASS],
      ["Fail", report.summary.FAIL],
      ["Absent", report.summary.ABSENT],
      ["Withheld", report.summary.WITHHELD],
      ["Total entries", report.summary.totalEntries],
      [],
      ["Roll number", "Student", "Subject", "Grade", "Status"],
      ...report.recentFailures.map((item) => [item.rollNumber, item.student, item.subject, item.grade ?? "", item.status])
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Reports", "ResultsSummary"),
      "Results report",
      rows
    );
  }

  private async studentSummary(scope: ScopeRef) {
    const where: Prisma.StudentProfileWhereInput = { currentStatus: UserStatus.ACTIVE, ...this.studentWhere(scope) };
    const total = await this.prisma.studentProfile.count({ where });
    return { active: total };
  }

  private async attendanceSummary(user: AuthUser, query: ReportsQueryDto, scope: ScopeRef) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE, scope }).allowed) return { sessions: 0, present: 0, absent: 0, percentage: 0 };
    const sessionWhere = this.attendanceWhere(query, scope);
    const [sessions, present, total] = await Promise.all([
      this.prisma.attendanceSession.count({ where: sessionWhere }),
      this.prisma.attendanceEntry.count({
        where: { status: AttendanceEntryStatus.PRESENT, session: sessionWhere }
      }),
      this.prisma.attendanceEntry.count({ where: { session: sessionWhere } })
    ]);
    return { sessions, present, absent: total - present, percentage: total ? Math.round((present / total) * 10000) / 100 : 0 };
  }

  private async financeSummary(user: AuthUser, query: ReportsQueryDto, scope: ScopeRef) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_FEES, scope }).allowed) return { collected: 0, payments: 0 };
    const aggregate = await this.prisma.feePayment.aggregate({
      where: {
        status: FeePaymentStatus.ACTIVE,
        studentProfile: this.studentProfileRelationWhere(scope),
        paidAt: this.paidAtRange(query)
      },
      _sum: { amount: true },
      _count: true
    });
    return { collected: Number(aggregate._sum.amount ?? 0), payments: aggregate._count };
  }

  private async resultsSummary(user: AuthUser, scope: ScopeRef) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_RESULTS, scope }).allowed) return { totalEntries: 0, failedOrAbsent: 0 };
    const [totalEntries, failedOrAbsent] = await Promise.all([
      this.prisma.resultEntry.count({ where: { studentProfile: this.studentProfileRelationWhere(scope) } }),
      this.prisma.resultEntry.count({ where: { status: { in: [ResultEntryStatus.FAIL, ResultEntryStatus.ABSENT] }, studentProfile: this.studentProfileRelationWhere(scope) } })
    ]);
    return { totalEntries, failedOrAbsent };
  }

  private async applicationSummary(user: AuthUser, scope: ScopeRef) {
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_APPLICATIONS, scope }).allowed) return { pending: 0 };
    return { pending: await this.prisma.studentApplication.count({ where: { status: StudentApplicationStatus.PENDING, studentProfile: this.studentProfileRelationWhere(scope) } }) };
  }

  private resolveScope(user: AuthUser, query: ReportsQueryDto): ScopeRef {
    const queryScope = this.queryToScope(query);
    const hasQueryScope = Object.values(queryScope).some(Boolean);

    if (user.type !== UserType.ADMIN) {
      if (hasQueryScope) return queryScope;
      const firstScope = user.assignments[0];
      if (!firstScope) throw new ForbiddenException("Reports require an assigned teacher scope.");
      return firstScope;
    }

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

  private queryToScope(query: ReportsQueryDto): ScopeRef {
    return { campusId: query.campusId, programId: query.programId, branchId: query.branchId, batchId: query.batchId, classId: query.classId, sectionId: query.sectionId };
  }

  private attendanceWhere(query: ReportsQueryDto, scope: ScopeRef): Prisma.AttendanceSessionWhereInput {
    const dateFilter = this.dateRange(query);
    const base: Prisma.AttendanceSessionWhereInput = { attendanceDate: dateFilter };
    if (scope.sectionId) return { ...base, sectionId: scope.sectionId };
    if (scope.classId) return { ...base, classId: scope.classId };
    if (scope.batchId) return { ...base, batchId: scope.batchId };
    if (scope.branchId) return { ...base, branchId: scope.branchId };
    if (scope.programId) return { ...base, programId: scope.programId };
    if (scope.campusId) return { ...base, campusId: scope.campusId };
    if (scope.campusGroupId) return { ...base, campus: { groupId: scope.campusGroupId } };
    return base;
  }

  private dateRange(query: ReportsQueryDto): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    // Use IST calendar-day boundaries so "from/to" match the dates users pick (not UTC days).
    if (query.from) filter.gte = parseIstDateOnly(query.from);
    if (query.to) filter.lte = istDayRangeFromIso(query.to).end;
    return filter;
  }

  private paidAtRange(query: ReportsQueryDto): Prisma.DateTimeFilter | undefined {
    return this.dateRange(query);
  }

  private createdAtRange(query: ReportsQueryDto): Prisma.DateTimeFilter | undefined {
    return this.dateRange(query);
  }

  private updatedAtRange(query: ReportsQueryDto): Prisma.DateTimeFilter | undefined {
    return this.dateRange(query);
  }

  private studentBoundaryWhere(scope: ScopeRef): Prisma.StudentProfileWhereInput | undefined {
    if (scope.campusId) {
      return this.sharedGroup.studentProfileWhereOperationalCampus(scope.campusId);
    }
    if (scope.campusGroupId) {
      return { section: { class: { batch: { branch: { program: { campus: { groupId: scope.campusGroupId } } } } } } };
    }
    return undefined;
  }

  private narrowStudentWhere(scope: ScopeRef): Prisma.StudentProfileWhereInput | undefined {
    if (scope.sectionId) return { sectionId: scope.sectionId };
    if (scope.classId) return { section: { classId: scope.classId } };
    if (scope.batchId) return { section: { class: { batchId: scope.batchId } } };
    if (scope.branchId) return { section: { class: { batch: { branchId: scope.branchId } } } };
    if (scope.programId) return { section: { class: { batch: { branch: { programId: scope.programId } } } } };
    return undefined;
  }

  private studentWhere(scope: ScopeRef): Prisma.StudentProfileWhereInput {
    const narrow = this.narrowStudentWhere(scope);
    const boundary = this.studentBoundaryWhere(scope);
    if (narrow && boundary) return { AND: [narrow, boundary] };
    return narrow ?? boundary ?? {};
  }

  private studentProfileRelationWhere(scope: ScopeRef): Prisma.StudentProfileWhereInput {
    return this.studentWhere(scope);
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

}

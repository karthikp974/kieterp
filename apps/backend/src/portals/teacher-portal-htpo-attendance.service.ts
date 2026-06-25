import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatIstDate,
  istDateParts,
  istDayRangeFromIso,
  istEndOfMonth,
  istMonthRange,
  istMonthsAgoStart,
  istStartOfDay,
  istTodayStart,
  istYear,
  parseIstDateOnly
} from "../common/ist-time.util";
import {
  AttendanceEntryStatus,
  CampusIsolationPolicy,
  PermissionAction,
  Prisma,
  StructureStatus,
  UserStatus,
  UserType
} from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { HtpoSectionAttendanceQueryDto, HtpoAttendancePeriodPreset } from "./htpo-attendance.dto";
import { TeacherPortalDashboardService } from "./teacher-portal-dashboard.service";
import {
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext
} from "./teacher-portal-section-scope.util";

type SectionContext = Prisma.SectionGetPayload<{
  include: {
    campus: { include: { group: true } };
    class: { include: { batch: { include: { branch: { include: { program: true } } } }, branch: true } };
  };
}>;

type StudentRow = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
  percentage: number | null;
  presentDays: number;
  workingDays: number;
  daysLabel: string;
};

@Injectable()
export class TeacherPortalHtpoAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly dashboard: TeacherPortalDashboardService
  ) {}

  async getSetup(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE }).allowed) {
      throw new ForbiddenException("Attendance is not available for this role.");
    }

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.VIEW_ATTENDANCE
    );
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    const sectionIds = ctx.sections.map((section) => section.id);
    const departmentLabel =
      sections.length === 1 ? sections[0]!.label.split(" · ")[0] ?? "Your section" : "Your sections";
    const overview = await this.dashboard.buildSupervisionOverview(sectionIds, departmentLabel);

    return {
      mode: ctx.mode,
      roles: ctx.roles,
      showSectionFilter: ctx.showSectionFilter,
      sections: ctx.sections,
      fixedSectionId: ctx.fixedSectionId,
      overview
    };
  }

  async getSectionAttendanceDetail(user: AuthUser, sectionId: string, query: HtpoSectionAttendanceQueryDto) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section);

    const period = await this.resolvePeriod(section, query);
    const campusIds = await this.campusIdsForWorkingDays(section.campus);
    const workingDayDates = await this.loadWorkingDayDates(campusIds, period);
    const workingDays = workingDayDates.size;

    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId: section.id, isArchived: false, currentStatus: UserStatus.ACTIVE },
      include: { user: { select: { fullName: true } } },
      orderBy: { rollNumber: "asc" }
    });

    const entries = await this.loadSectionEntries(section, period, students.map((s) => s.id));
    const presentDatesByStudent = this.presentDatesByStudent(entries);

    const rows = students.map((student) => {
      const presentDates = presentDatesByStudent.get(student.id) ?? new Set<string>();
      const presentDays = [...presentDates].filter((d) => workingDayDates.has(d)).length;
      return this.toStudentRow(student, presentDays, workingDays);
    });

    const search = query.search?.trim().toLowerCase();
    const filteredRows = search
      ? rows.filter(
          (row) =>
            row.rollNumber.toLowerCase().includes(search) ||
            row.fullName.toLowerCase().includes(search)
        )
      : rows;

    const below75Percent = filteredRows.filter((row) => row.percentage !== null && row.percentage < 75);

    return {
      section: {
        id: section.id,
        label: this.sectionLabel(section),
        name: section.name,
        semesterNumber: section.class.semesterNumber
      },
      period: {
        preset: period.preset,
        label: period.label,
        from: period.from?.toISOString() ?? null,
        to: period.to?.toISOString() ?? null,
        workingDays
      },
      yearOptions: this.batchYearOptions(section.class.batch),
      students: students.map((s) => ({
        studentProfileId: s.id,
        rollNumber: s.rollNumber,
        fullName: s.user.fullName
      })),
      attendanceOverview: filteredRows,
      below75Percent
    };
  }

  async getMarkSetup(user: AuthUser, sectionId: string) {
    const section = await this.loadSection(sectionId);
    const scope = {
      campusId: section.campusId,
      programId: section.class.batch.branch.programId,
      branchId: section.class.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id
    };
    if (!this.permissions.can(user, { action: PermissionAction.MARK_ATTENDANCE, scope }).allowed) {
      throw new ForbiddenException("You cannot mark attendance for this section.");
    }

    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId: section.id, isArchived: false, currentStatus: UserStatus.ACTIVE },
      select: { id: true, rollNumber: true, user: { select: { fullName: true } } },
      orderBy: { rollNumber: "asc" }
    });

    const today = istTodayStart();

    return {
      section: {
        id: section.id,
        label: this.sectionLabel(section)
      },
      scope,
      attendanceDate: formatIstDate(today),
      students: students.map((student) => ({
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName
      }))
    };
  }

  async getStudentAttendanceDetail(
    user: AuthUser,
    sectionId: string,
    studentProfileId: string,
    query: HtpoSectionAttendanceQueryDto
  ) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section);

    const student = await this.prisma.studentProfile.findFirst({
      where: {
        id: studentProfileId,
        sectionId: section.id,
        isArchived: false,
        currentStatus: UserStatus.ACTIVE
      },
      include: { user: { select: { fullName: true, email: true } } }
    });
    if (!student) throw new NotFoundException("Student not found in this section.");

    const period = await this.resolvePeriod(section, query);
    const campusIds = await this.campusIdsForWorkingDays(section.campus);
    const workingDayDates = await this.loadWorkingDayDates(campusIds, period);
    const workingDays = workingDayDates.size;

    const entries = await this.prisma.attendanceEntry.findMany({
      where: {
        studentProfileId: student.id,
        session: this.sessionWhereForPeriod(section, period)
      },
      include: {
        session: {
          select: {
            attendanceDate: true,
            markedBy: { select: { fullName: true } },
            subject: { select: { code: true, name: true } }
          }
        }
      },
      orderBy: { session: { attendanceDate: "desc" } }
    });

    const presentDates = new Set<string>();
    const subjectStats = new Map<string, { present: number; total: number }>();
    for (const entry of entries) {
      const dateKey = this.dateKey(entry.session.attendanceDate);
      if (entry.status === AttendanceEntryStatus.PRESENT) presentDates.add(dateKey);
      const subjectLabel = entry.session.subject
        ? `${entry.session.subject.code} — ${entry.session.subject.name}`
        : "General";
      const row = subjectStats.get(subjectLabel) ?? { present: 0, total: 0 };
      row.total += 1;
      if (entry.status === AttendanceEntryStatus.PRESENT) row.present += 1;
      subjectStats.set(subjectLabel, row);
    }

    const presentDays = [...presentDates].filter((d) => workingDayDates.has(d)).length;
    const percentage = workingDays ? Math.round((presentDays / workingDays) * 100) : null;

    return {
      section: {
        id: section.id,
        label: this.sectionLabel(section),
        name: section.name,
        semesterNumber: section.class.semesterNumber
      },
      student: {
        studentProfileId: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        email: student.user.email
      },
      period: {
        preset: period.preset,
        label: period.label,
        from: period.from?.toISOString() ?? null,
        to: period.to?.toISOString() ?? null,
        workingDays
      },
      yearOptions: this.batchYearOptions(section.class.batch),
      summary: {
        percentage,
        presentDays,
        workingDays,
        absentDays: Math.max(workingDays - presentDays, 0),
        daysLabel: `${presentDays}/${workingDays}`
      },
      bySubject: [...subjectStats.entries()]
        .map(([subject, stats]) => ({
          subject,
          present: stats.present,
          total: stats.total,
          percentage: stats.total ? Math.round((stats.present / stats.total) * 100) : null
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject)),
      sessions: entries.map((entry) => ({
        id: entry.id,
        date: entry.session.attendanceDate.toISOString(),
        subject: entry.session.subject
          ? `${entry.session.subject.code} — ${entry.session.subject.name}`
          : "General",
        status: entry.status,
        markedBy: entry.session.markedBy.fullName
      }))
    };
  }

  private async loadSection(sectionId: string): Promise<SectionContext> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: {
        campus: { include: { group: true } },
        class: { include: { batch: { include: { branch: { include: { program: true } } } }, branch: true } }
      }
    });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private assertSectionAccess(user: AuthUser, section: SectionContext) {
    const scope = {
      campusId: section.campusId,
      branchId: section.class.branchId,
      classId: section.classId,
      sectionId: section.id
    };
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_ATTENDANCE, scope }).allowed) {
      throw new ForbiddenException("You cannot view attendance for this section.");
    }
  }

  private async campusIdsForWorkingDays(campus: SectionContext["campus"]) {
    if (campus.group.isolationPolicy === CampusIsolationPolicy.SHARED) {
      const rows = await this.prisma.campus.findMany({
        where: { groupId: campus.groupId, status: StructureStatus.ACTIVE, isActive: true },
        select: { id: true }
      });
      return rows.map((row) => row.id);
    }
    return [campus.id];
  }

  private async loadWorkingDayDates(
    campusIds: string[],
    period: ResolvedPeriod
  ): Promise<Set<string>> {
    if (period.semesterClassId === "__none__") return new Set();

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        campusId: { in: campusIds },
        ...(period.semesterClassId
          ? { classId: period.semesterClassId }
          : this.dateRangeWhere(period))
      },
      select: { attendanceDate: true }
    });
    return new Set(sessions.map((s) => this.dateKey(s.attendanceDate)));
  }

  private async loadSectionEntries(
    section: SectionContext,
    period: ResolvedPeriod,
    studentIds: string[]
  ) {
    if (!studentIds.length) return [];
    return this.prisma.attendanceEntry.findMany({
      where: {
        studentProfileId: { in: studentIds },
        session: {
          sectionId: section.id,
          ...this.sessionWhereForPeriod(section, period)
        }
      },
      select: {
        studentProfileId: true,
        status: true,
        session: { select: { attendanceDate: true } }
      }
    });
  }

  private sessionWhereForPeriod(
    section: SectionContext,
    period: ResolvedPeriod
  ): Prisma.AttendanceSessionWhereInput {
    if (period.semesterClassId) {
      return { classId: period.semesterClassId, sectionId: section.id };
    }
    return this.dateRangeWhere(period);
  }

  private dateRangeWhere(period: ResolvedPeriod): Prisma.AttendanceSessionWhereInput {
    if (!period.from && !period.to) return {};
    return {
      attendanceDate: {
        ...(period.from ? { gte: period.from } : {}),
        ...(period.to ? { lte: period.to } : {})
      }
    };
  }

  private presentDatesByStudent(
    entries: { studentProfileId: string; status: AttendanceEntryStatus; session: { attendanceDate: Date } }[]
  ) {
    const map = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (entry.status !== AttendanceEntryStatus.PRESENT) continue;
      const set = map.get(entry.studentProfileId) ?? new Set<string>();
      set.add(this.dateKey(entry.session.attendanceDate));
      map.set(entry.studentProfileId, set);
    }
    return map;
  }

  private toStudentRow(
    student: { id: string; rollNumber: string; user: { fullName: string } },
    presentDays: number,
    workingDays: number
  ): StudentRow {
    const percentage = workingDays ? Math.round((presentDays / workingDays) * 100) : null;
    return {
      studentProfileId: student.id,
      rollNumber: student.rollNumber,
      fullName: student.user.fullName,
      percentage,
      presentDays,
      workingDays,
      daysLabel: `${presentDays}/${workingDays}`
    };
  }

  private async resolvePeriod(section: SectionContext, query: HtpoSectionAttendanceQueryDto): Promise<ResolvedPeriod> {
    const preset = query.period ?? "this_semester";
    const now = new Date();

    if (preset === "custom") {
      const rangeFrom = query.dateFrom ?? query.date;
      const rangeTo = query.dateTo ?? query.date;
      if (rangeFrom) {
        const from = parseIstDateOnly(rangeFrom.slice(0, 10));
        if (rangeTo) {
          const toDay = parseIstDateOnly(rangeTo.slice(0, 10));
          if (toDay.getTime() < from.getTime()) {
            throw new BadRequestException("Custom period end date must be on or after the start date.");
          }
          const { end: to } = istDayRangeFromIso(rangeTo.slice(0, 10));
          return {
            preset,
            label: this.formatCustomRangeLabel(from, toDay),
            from,
            to
          };
        }
        const { end } = istDayRangeFromIso(rangeFrom.slice(0, 10));
        return {
          preset,
          label: from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
          from,
          to: end
        };
      }
      if (!query.year) {
        throw new BadRequestException("Custom period requires a year.");
      }
      if (query.month) {
        const from = istStartOfDay(query.year, query.month, 1);
        const to = istEndOfMonth(query.year, query.month);
        return {
          preset,
          label: from.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
          from,
          to
        };
      }
      const from = istStartOfDay(query.year, 1, 1);
      const to = istEndOfMonth(query.year, 12);
      return { preset, label: String(query.year), from, to };
    }

    if (preset === "this_month") {
      const { start: from, end: to } = istMonthRange(now);
      return {
        preset,
        label: from.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
        from,
        to
      };
    }

    if (preset === "last_2_months") {
      const from = istMonthsAgoStart(1, now);
      const to = istMonthRange(now).end;
      return { preset, label: "Last 2 months", from, to };
    }

    if (preset === "this_semester") {
      return {
        preset,
        label: `Semester ${section.class.semesterNumber}`,
        semesterClassId: section.classId
      };
    }

    const previousClass = await this.prisma.academicClass.findFirst({
      where: {
        batchId: section.class.batchId,
        semesterNumber: section.class.semesterNumber - 1,
        isArchived: false,
        status: StructureStatus.ACTIVE
      },
      select: { id: true, semesterNumber: true }
    });
    if (!previousClass) {
      return { preset, label: "Last semester", semesterClassId: "__none__" };
    }
    return {
      preset,
      label: `Semester ${previousClass.semesterNumber}`,
      semesterClassId: previousClass.id
    };
  }

  private batchYearOptions(batch: { startYear: number; endYear: number }) {
    const years: { year: number; label: string; isOngoing: boolean }[] = [];
    const nowYear = istYear(new Date());
    for (let year = batch.startYear; year < batch.endYear; year += 1) {
      const isOngoing = nowYear >= year && nowYear < year + 1;
      years.push({
        year,
        label: isOngoing ? `${year} (ongoing)` : String(year),
        isOngoing
      });
    }
    return years;
  }

  private sectionLabel(section: SectionContext) {
    const branch = section.class.branch.name;
    const sem = section.class.semesterNumber;
    return `${branch} · Sem ${sem} · ${section.name}`;
  }

  private formatCustomRangeLabel(from: Date, to: Date) {
    const fromP = istDateParts(from);
    const toP = istDateParts(to);
    const sameDay = fromP.year === toP.year && fromP.month === toP.month && fromP.day === toP.day;
    if (sameDay) {
      return from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    }
    const sameYear = fromP.year === toP.year;
    const sameMonth = sameYear && fromP.month === toP.month;
    if (sameMonth) {
      const monthYear = from.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
      return `${fromP.day}–${toP.day} ${monthYear}`;
    }
    if (sameYear) {
      return `${from.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} – ${to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
    }
    return `${from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} – ${to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
  }

  private dateKey(value: Date) {
    return formatIstDate(value);
  }
}

type ResolvedPeriod = {
  preset: HtpoAttendancePeriodPreset;
  label: string;
  from?: Date;
  to?: Date;
  semesterClassId?: string;
};

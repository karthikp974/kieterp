import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { formatIstDate, parseIstDateOnly } from "../common/ist-time.util";
import { attendanceDayPeriod } from "../common/attendance.constants";
import { AttendanceCorrectionStatus, AttendanceEntryStatus, PermissionAction, Prisma, StructureStatus, UserStatus, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { buildExportBasename } from "../common/export-filename.util";
import { toPagination } from "../common/pagination.dto";
import { sendTabularExport } from "../common/tabular-export.util";
import { PermissionsService } from "../permissions/permissions.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AttendanceExportQueryDto,
  AttendanceQueryDto,
  AttendanceScopeDto,
  BulkMarkAttendanceDto,
  CorrectionRequestQueryDto,
  CreateAttendanceHolidayDto,
  CreateCorrectionRequestDto,
  MarkAttendanceDto
} from "./attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async list(user: AuthUser, query: AttendanceQueryDto) {
    const pagination = toPagination(query);
    const scope = this.queryToScope(query);
    if (user.type === UserType.STUDENT) {
      throw new ForbiddenException("Students must use their personal attendance endpoint.");
    }
    if (user.type === UserType.TEACHER && !scope) {
      throw new ForbiddenException("Teacher attendance lists must be filtered by assigned scope.");
    }
    this.assertAllowed(user, PermissionAction.VIEW_ATTENDANCE, scope);

    const where: Prisma.AttendanceSessionWhereInput = {
      campusId: query.campusId,
      classId: query.classId,
      sectionId: query.sectionId,
      subjectId: query.subjectId,
      ...(query.from || query.to
        ? {
            attendanceDate: {
              gte: query.from ? this.dateOnly(query.from) : undefined,
              lte: query.to ? this.dateOnly(query.to) : undefined
            }
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { section: { name: { contains: query.search, mode: "insensitive" } } },
              { subject: { name: { contains: query.search, mode: "insensitive" } } },
              { subject: { code: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        include: {
          campus: true,
          program: true,
          branch: true,
          batch: true,
          class: true,
          section: true,
          subject: true,
          markedBy: { select: { fullName: true } },
          entries: true
        },
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.attendanceSession.count({ where })
    ]);

    return {
      items: items.map((session) => this.toSessionObject(session)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async get(user: AuthUser, id: string) {
    if (user.type === UserType.STUDENT) {
      throw new ForbiddenException("Students must use their personal attendance endpoint.");
    }

    const session = await this.prisma.attendanceSession.findUnique({
      where: { id },
      include: {
        campus: true,
        program: true,
        branch: true,
        batch: true,
        class: true,
        section: true,
        subject: true,
        markedBy: { select: { fullName: true } },
        entries: { include: { studentProfile: { include: { user: true } } }, orderBy: { studentProfile: { rollNumber: "asc" } } }
      }
    });
    if (!session) throw new NotFoundException("Attendance session not found.");
    this.assertAllowed(user, PermissionAction.VIEW_ATTENDANCE, this.sessionToScope(session));
    return { session: this.toSessionObject(session, true) };
  }

  async roster(user: AuthUser, scope: AttendanceScopeDto) {
    if (user.type === UserType.STUDENT) {
      throw new ForbiddenException("Students must use their personal attendance endpoint.");
    }

    await this.validateScope(scope);
    this.assertAllowed(user, PermissionAction.VIEW_ATTENDANCE, scope);

    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId: scope.sectionId, currentStatus: UserStatus.ACTIVE },
      include: { user: true },
      orderBy: { rollNumber: "asc" },
      take: 100
    });

    return {
      students: students.map((student) => ({
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName
      }))
    };
  }

  async mark(user: AuthUser, dto: MarkAttendanceDto) {
    await this.validateScope(dto.scope);
    this.assertAllowed(user, PermissionAction.MARK_ATTENDANCE, dto.scope);
    this.assertTeacherRoleRules(user, dto.scope);

    const attendanceDate = this.dateOnly(dto.attendanceDate);
    await this.assertNotHoliday(dto.scope.campusId, attendanceDate);
    const periodLabel = attendanceDayPeriod();
    const sessionKey = this.buildSessionKey(dto.scope.sectionId, dto.scope.subjectId, attendanceDate);
    const uniqueStudentIds = new Set(dto.entries.map((entry) => entry.studentProfileId));
    if (uniqueStudentIds.size !== dto.entries.length) {
      throw new BadRequestException("Duplicate student attendance entries found.");
    }

    const validStudents = await this.prisma.studentProfile.findMany({
      where: { id: { in: [...uniqueStudentIds] }, sectionId: dto.scope.sectionId, currentStatus: UserStatus.ACTIVE },
      select: { id: true }
    });
    if (validStudents.length !== dto.entries.length) {
      throw new BadRequestException("Every attendance entry must belong to an active student in the selected section.");
    }

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attendanceSession.create({
          data: {
            sessionKey,
            campusId: dto.scope.campusId,
            programId: dto.scope.programId,
            branchId: dto.scope.branchId,
            batchId: dto.scope.batchId,
            classId: dto.scope.classId,
            sectionId: dto.scope.sectionId,
            subjectId: dto.scope.subjectId,
            markedById: user.id,
            attendanceDate,
            periodLabel,
            entries: {
              create: dto.entries.map((entry) => ({
                studentProfileId: entry.studentProfileId,
                status: entry.status,
                note: entry.note?.trim()
              }))
            }
          },
          include: { entries: true }
        });

        await tx.auditLog.create({
          data: {
            action: "MARK_ATTENDANCE",
            entity: "AttendanceSession",
            entityId: created.id,
            userId: user.auditUserId,
            metadata: { sectionId: dto.scope.sectionId, subjectId: dto.scope.subjectId, attendanceDate: attendanceDate.toISOString(), entries: dto.entries.length }
          }
        });

        return created;
      });

      return { id: session.id, marked: session.entries.length };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Attendance for this section, subject, and date is already marked.");
      }
      throw error;
    }
  }

  async bulkMark(user: AuthUser, dto: BulkMarkAttendanceDto) {
    const marked: string[] = [];
    const errors: { index: number; message: string }[] = [];

    for (const [index, session] of dto.sessions.entries()) {
      try {
        const result = await this.mark(user, session);
        marked.push(result.id);
      } catch (error) {
        errors.push({ index, message: error instanceof Error ? error.message : "Attendance bulk mark failed." });
      }
    }

    return { marked: marked.length, errors };
  }

  async export(user: AuthUser, query: AttendanceExportQueryDto, response: Response) {
    const data = await this.list(user, { ...query, page: 1, pageSize: 100 });
    const rows: (string | number)[][] = [
      ["Date", "Campus", "Branch", "Semester", "Section", "Subject", "Marked By", "Total", "Present", "Absent", "Percentage"],
      ...data.items.map((item) => [
        formatIstDate(new Date(item.date)),
        item.structure.campus,
        item.structure.branch,
        String(item.structure.semester),
        item.structure.section,
        item.structure.subject,
        item.markedBy,
        String(item.summary.total),
        String(item.summary.present),
        String(item.summary.absent),
        String(item.summary.percentage)
      ])
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Attendance", "SessionExport"),
      "Attendance export",
      rows
    );
  }

  async createCorrectionRequest(user: AuthUser, sessionId: string, dto: CreateCorrectionRequestDto) {
    const session = await this.prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: { entries: true } });
    if (!session) throw new NotFoundException("Attendance session not found.");
    this.assertAllowed(user, PermissionAction.MARK_ATTENDANCE, this.sessionToScope(session));

    const sessionStudentIds = new Set(session.entries.map((entry) => entry.studentProfileId));
    if (dto.entries.some((entry) => !sessionStudentIds.has(entry.studentProfileId))) {
      throw new BadRequestException("Correction entries must belong to the selected attendance session.");
    }

    const request = await this.prisma.attendanceCorrectionRequest.create({
      data: {
        sessionId,
        requestedById: user.id,
        reason: dto.reason.trim(),
        entries: dto.entries as unknown as Prisma.InputJsonArray
      }
    });

    await this.prisma.auditLog.create({
      data: { action: "REQUEST_ATTENDANCE_CORRECTION", entity: "AttendanceCorrectionRequest", entityId: request.id, userId: user.auditUserId }
    });
    return { request };
  }

  async listCorrectionRequests(user: AuthUser, query: CorrectionRequestQueryDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can review attendance corrections.");
    const pagination = toPagination(query);
    const where: Prisma.AttendanceCorrectionRequestWhereInput = { status: query.status ?? AttendanceCorrectionStatus.PENDING };
    const [items, total] = await Promise.all([
      this.prisma.attendanceCorrectionRequest.findMany({
        where,
        include: {
          requestedBy: { select: { fullName: true } },
          session: { include: { section: true, subject: true, class: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.attendanceCorrectionRequest.count({ where })
    ]);
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async approveCorrectionRequest(user: AuthUser, id: string) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can approve attendance corrections.");
    const request = await this.prisma.attendanceCorrectionRequest.findUnique({ where: { id }, include: { session: true } });
    if (!request) throw new NotFoundException("Correction request not found.");
    this.assertAllowed(user, PermissionAction.MARK_ATTENDANCE, this.sessionToScope(request.session));
    if (request.status !== AttendanceCorrectionStatus.PENDING) throw new BadRequestException("Correction request is already reviewed.");

    const entries = request.entries as unknown as { studentProfileId: string; status: AttendanceEntryStatus; note?: string }[];
    await this.prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.attendanceEntry.update({
          where: { sessionId_studentProfileId: { sessionId: request.sessionId, studentProfileId: entry.studentProfileId } },
          data: { status: entry.status, note: entry.note?.trim() }
        });
      }
      await tx.attendanceCorrectionRequest.update({
        where: { id },
        data: { status: AttendanceCorrectionStatus.APPROVED, reviewedAt: new Date() }
      });
      await tx.auditLog.create({
        data: { action: "APPROVE_ATTENDANCE_CORRECTION", entity: "AttendanceCorrectionRequest", entityId: id, userId: user.auditUserId }
      });
    });
    return { ok: true };
  }

  async rejectCorrectionRequest(user: AuthUser, id: string) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can reject attendance corrections.");
    const request = await this.prisma.attendanceCorrectionRequest.findUnique({ where: { id }, include: { session: true } });
    if (!request) throw new NotFoundException("Correction request not found.");
    this.assertAllowed(user, PermissionAction.MARK_ATTENDANCE, this.sessionToScope(request.session));
    await this.prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: AttendanceCorrectionStatus.REJECTED, reviewedAt: new Date() }
    });
    await this.prisma.auditLog.create({
      data: { action: "REJECT_ATTENDANCE_CORRECTION", entity: "AttendanceCorrectionRequest", entityId: id, userId: user.auditUserId }
    });
    return { ok: true };
  }

  async createHoliday(user: AuthUser, dto: CreateAttendanceHolidayDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can create attendance holidays.");
    const holidayDate = this.dateOnly(dto.holidayDate);
    const holiday = await this.prisma.attendanceHoliday.create({
      data: { campusId: dto.campusId, holidayDate, title: dto.title.trim() }
    });
    await this.prisma.auditLog.create({
      data: { action: "CREATE_ATTENDANCE_HOLIDAY", entity: "AttendanceHoliday", entityId: holiday.id, userId: user.auditUserId }
    });
    return { holiday };
  }

  async listHolidays() {
    return this.prisma.attendanceHoliday.findMany({ include: { campus: true }, orderBy: { holidayDate: "desc" }, take: 100 });
  }

  async mySummary(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only students can view their own attendance summary.");
    }

    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException("Student profile not found.");

    const entries = await this.prisma.attendanceEntry.findMany({
      where: { studentProfileId: profile.id },
      include: { session: { include: { subject: true, section: true, class: true } } },
      orderBy: { session: { attendanceDate: "desc" } },
      take: 100
    });

    const totals = entries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.status === AttendanceEntryStatus.PRESENT) acc.present += 1;
        return acc;
      },
      { total: 0, present: 0 }
    );

    const bySubject = new Map<string, { subject: string; total: number; present: number }>();
    for (const entry of entries) {
      const key = entry.session.subjectId ?? "GENERAL";
      const current = bySubject.get(key) ?? { subject: entry.session.subject?.name ?? "General", total: 0, present: 0 };
      current.total += 1;
      if (entry.status === AttendanceEntryStatus.PRESENT) current.present += 1;
      bySubject.set(key, current);
    }

    return {
      summary: {
        total: totals.total,
        present: totals.present,
        percentage: totals.total ? Math.round((totals.present / totals.total) * 100) : 0
      },
      bySubject: [...bySubject.values()].map((item) => ({
        ...item,
        percentage: item.total ? Math.round((item.present / item.total) * 100) : 0
      })),
      recent: entries.slice(0, 25).map((entry) => ({
        id: entry.id,
        date: entry.session.attendanceDate,
        subject: entry.session.subject?.name ?? "General",
        section: entry.session.section.name,
        semester: entry.session.class.semesterNumber,
        status: entry.status
      }))
    };
  }

  private async validateScope(scope: AttendanceScopeDto) {
    const section = await this.prisma.section.findUnique({
      where: { id: scope.sectionId },
      include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } }
    });
    if (
      !section ||
      section.status !== StructureStatus.ACTIVE ||
      section.classId !== scope.classId ||
      section.class.status !== StructureStatus.ACTIVE ||
      section.class.batchId !== scope.batchId ||
      section.class.batch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branchId !== scope.branchId ||
      section.class.batch.branch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.programId !== scope.programId ||
      section.class.batch.branch.program.status !== StructureStatus.ACTIVE
    ) {
      throw new BadRequestException("Attendance scope is invalid or archived.");
    }

    const operationalCampus = await this.sharedGroup.loadCampus(scope.campusId);
    if (!operationalCampus || operationalCampus.status !== StructureStatus.ACTIVE) {
      throw new BadRequestException("Campus does not exist or is archived.");
    }
    this.sharedGroup.assertScopeCampusMatchesSectionProgram(section.class.batch.branch.program, scope.campusId, operationalCampus);

    if (scope.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: scope.subjectId } });
      if (
        !subject ||
        subject.status !== StructureStatus.ACTIVE ||
        subject.branchId !== scope.branchId ||
        subject.semesterNumber !== section.class.semesterNumber
      ) {
        throw new BadRequestException("Subject does not match selected branch and semester.");
      }
    }
  }

  private async assertNotHoliday(campusId: string, attendanceDate: Date) {
    const holiday = await this.prisma.attendanceHoliday.findUnique({
      where: { campusId_holidayDate: { campusId, holidayDate: attendanceDate } }
    });
    if (holiday) {
      throw new BadRequestException(`Attendance cannot be marked on holiday: ${holiday.title}.`);
    }
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private assertTeacherRoleRules(user: AuthUser, scope: AttendanceScopeDto) {
    if (user.type !== UserType.TEACHER) return;

    const matchingAssignments = user.assignments.filter((assignment) => {
      if (assignment.sectionId && assignment.sectionId !== scope.sectionId) return false;
      if (assignment.classId && assignment.classId !== scope.classId) return false;
      if (assignment.subjectId && assignment.subjectId !== scope.subjectId) return false;
      return true;
    });

    if (matchingAssignments.some((assignment) => assignment.role === "STPO") && !scope.subjectId) {
      throw new ForbiddenException("Subject teacher attendance requires a subject.");
    }
  }

  private queryToScope(query: AttendanceQueryDto): ScopeRef | undefined {
    if (!query.campusId && !query.classId && !query.sectionId && !query.subjectId) return undefined;
    return { campusId: query.campusId, classId: query.classId, sectionId: query.sectionId, subjectId: query.subjectId };
  }

  private sessionToScope(session: { campusId: string; classId: string; sectionId: string; subjectId: string | null }): ScopeRef {
    return {
      campusId: session.campusId,
      classId: session.classId,
      sectionId: session.sectionId,
      subjectId: session.subjectId ?? undefined
    };
  }

  private buildSessionKey(sectionId: string, subjectId: string | undefined, date: Date) {
    return [sectionId, subjectId ?? "GENERAL", formatIstDate(date), attendanceDayPeriod()].join("|");
  }

  private dateOnly(value: string) {
    const trimmed = value.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid attendance date.");
      return parseIstDateOnly(formatIstDate(date));
    }
    return parseIstDateOnly(trimmed);
  }


  private toSessionObject(
    session: {
      id: string;
      attendanceDate: Date;
      isLocked: boolean;
      campus: { code: string };
      program: { code: string };
      branch: { code: string };
      batch: { startYear: number; endYear: number };
      class: { semesterNumber: number; label: string };
      section: { name: string };
      subject: { code: string; name: string } | null;
      markedBy: { fullName: string };
      entries: { status: AttendanceEntryStatus; studentProfile?: { rollNumber: string; user: { fullName: string } } }[];
    },
    includeEntries = false
  ) {
    const present = session.entries.filter((entry) => entry.status === AttendanceEntryStatus.PRESENT).length;
    return {
      id: session.id,
      date: session.attendanceDate,
      isLocked: session.isLocked,
      structure: {
        campus: session.campus.code,
        program: session.program.code,
        branch: session.branch.code,
        batch: `${session.batch.startYear}-${session.batch.endYear}`,
        semester: session.class.semesterNumber,
        classLabel: session.class.label,
        section: session.section.name,
        subject: session.subject ? `${session.subject.code} - ${session.subject.name}` : "General"
      },
      markedBy: session.markedBy.fullName,
      summary: {
        total: session.entries.length,
        present,
        absent: session.entries.length - present,
        percentage: session.entries.length ? Math.round((present / session.entries.length) * 100) : 0
      },
      entries: includeEntries
        ? session.entries.map((entry) => ({
            rollNumber: entry.studentProfile?.rollNumber,
            fullName: entry.studentProfile?.user.fullName,
            status: entry.status
          }))
        : undefined
    };
  }
}

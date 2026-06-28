import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { formatIstDate } from "../common/ist-time.util";
import { AuthSessionStatus, Prisma, StructureStatus, UserStatus, UserType } from "@prisma/client";
import bcrypt from "bcrypt";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { CampusScopeService, isInstitutionWideAdmin } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queues/queues.module";
import { STUDENT_BULK_IMPORT_JOB } from "../queues/queue.constants";
import { BulkCreateStudentsDto, CreateStudentDto, ResetStudentPasswordDto, StudentListQueryDto, UpdateStudentDto } from "./students.dto";
import { buildStudentFallbackEmail, normalizeRollNumber, resolveStudentInitialPassword } from "./student.util";

type BulkImportProgress = { phase: "queued" | "importing"; processed: number; total: number; percent: number };

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService
  ) {}

  async list(query: StudentListQueryDto, user: AuthUser, scopeWhere: Prisma.StudentProfileWhereInput = {}) {
    const pagination = toPagination(query);
    if (query.campusId) {
      await this.campusScope.assertCampusAllowed(user, query.campusId);
    }
    const baseWhere: Prisma.StudentProfileWhereInput = {
      isArchived: false,
      currentStatus: query.status ?? UserStatus.ACTIVE,
      sectionId: query.sectionId,
      ...this.campusScope.studentProfileWhere(user),
      ...(query.classId ? { section: { classId: query.classId } } : {}),
      ...(query.campusId ? { user: { campusId: query.campusId } } : {}),
      ...(query.search
        ? {
            OR: [
              { rollNumber: { contains: query.search, mode: "insensitive" } },
              { fatherName: { contains: query.search, mode: "insensitive" } },
              { user: { fullName: { contains: query.search, mode: "insensitive" } } },
              { user: { email: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    // Extra scope (e.g. teacher section restriction) is ANDed so it never collides with the search OR.
    const where: Prisma.StudentProfileWhereInput = Object.keys(scopeWhere).length
      ? { AND: [baseWhere, scopeWhere] }
      : baseWhere;

    const [items, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: { include: { campus: true } },
          createdBy: { select: { id: true, fullName: true, username: true, type: true } },
          section: { include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } } }
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentProfile.count({ where })
    ]);

    return { items: items.map((student) => this.toStudentObject(student)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async search(query: StudentListQueryDto, user: AuthUser) {
    return this.list({ ...query, page: query.page ?? 1, pageSize: query.pageSize ?? 10, status: query.status ?? UserStatus.ACTIVE }, user);
  }

  async get(id: string, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    return this.getById(id);
  }

  async getById(id: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: true,
        createdBy: { select: { id: true, fullName: true, username: true, type: true } },
        section: { include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } } }
      }
    });
    if (!student) throw new NotFoundException("Student not found.");
    return { student: this.toStudentObject(student) };
  }

  async create(dto: CreateStudentDto, actor?: AuthUser) {
    const section = await this.getSectionWithCampus(dto.sectionId);
    await this.validateRequestedStructure(section, dto);
    const operationalCampusId = dto.campusId?.trim();
    if (!operationalCampusId) {
      throw new BadRequestException("Campus is required for student enrollment.");
    }
    const rollNumber = normalizeRollNumber(dto.rollNumber);
    const email = dto.email?.trim().toLowerCase() || buildStudentFallbackEmail(rollNumber);
    const password = resolveStudentInitialPassword(rollNumber, dto.password);
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const student = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            campusId: operationalCampusId,
            email,
            passwordHash,
            fullName: dto.fullName.trim(),
            phone: dto.phone?.trim(),
            type: UserType.STUDENT
          }
        });

        return tx.studentProfile.create({
          data: {
            userId: user.id,
            sectionId: dto.sectionId,
            rollNumber,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            fatherName: dto.fatherName.trim(),
            village: dto.village?.trim() || undefined,
            mandal: dto.mandal?.trim() || undefined,
            district: dto.district?.trim() || undefined,
            state: dto.state?.trim() || undefined,
            pincode: dto.pincode?.trim() || undefined,
            homeAddress: dto.homeAddress?.trim() || undefined,
            currentStatus: UserStatus.ACTIVE,
            createdById: actor?.id
          },
          include: {
            user: true,
            createdBy: { select: { id: true, fullName: true, username: true, type: true } },
            section: { include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } } }
          }
        });
      });

      await this.logAudit("CREATE_STUDENT", "StudentProfile", student.id, {
        rollNumber,
        ...(actor ? { createdById: actor.id } : {})
      });
      return { student: this.toStudentObject(student) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Student email or roll number already exists.");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateStudentDto, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    const existing = await this.prisma.studentProfile.findUnique({ where: { id }, include: { user: true } });
    if (!existing || existing.isArchived) throw new NotFoundException("Student not found.");

    let campusId = existing.user.campusId;
    if (dto.sectionId) {
      const section = await this.getSectionWithCampus(dto.sectionId);
      const campusIdForValidation = dto.campusId ?? existing.user.campusId ?? undefined;
      if (!campusIdForValidation) {
        throw new BadRequestException("Campus is required when changing section.");
      }
      await this.validateRequestedStructure(section, { ...dto, campusId: campusIdForValidation });
    }
    if (dto.campusId) {
      campusId = dto.campusId;
    }

    try {
      const student = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            campusId,
            fullName: dto.fullName?.trim(),
            email: dto.email?.trim().toLowerCase(),
            phone: dto.phone?.trim(),
            status: dto.status
          }
        });

        return tx.studentProfile.update({
          where: { id },
          data: {
            rollNumber: dto.rollNumber ? normalizeRollNumber(dto.rollNumber) : undefined,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            fatherName: dto.fatherName !== undefined ? dto.fatherName.trim() || null : undefined,
            village: dto.village !== undefined ? dto.village.trim() || null : undefined,
            mandal: dto.mandal !== undefined ? dto.mandal.trim() || null : undefined,
            district: dto.district !== undefined ? dto.district.trim() || null : undefined,
            state: dto.state !== undefined ? dto.state.trim() || null : undefined,
            pincode: dto.pincode !== undefined ? dto.pincode.trim() || null : undefined,
            homeAddress: dto.homeAddress !== undefined ? dto.homeAddress.trim() || null : undefined,
            sectionId: dto.sectionId,
            currentStatus: dto.status
          },
          include: {
            user: true,
            section: { include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } } }
          }
        });
      });

      await this.logAudit("UPDATE_STUDENT", "StudentProfile", id, { fields: Object.keys(dto) });
      return { student: this.toStudentObject(student) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Student email or roll number already exists.");
      }
      throw error;
    }
  }

  async deactivate(id: string, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    const student = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!student) throw new NotFoundException("Student not found.");

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: student.userId }, data: { status: UserStatus.INACTIVE } }),
      this.prisma.studentProfile.update({ where: { id }, data: { currentStatus: UserStatus.INACTIVE } }),
      this.prisma.authSession.updateMany({
        where: { userId: student.userId, status: AuthSessionStatus.ACTIVE },
        data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
      })
    ]);

    await this.logAudit("DEACTIVATE_STUDENT", "StudentProfile", id);
    return { ok: true };
  }

  async archive(id: string, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    const student = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true, isArchived: true } });
    if (!student || student.isArchived) throw new NotFoundException("Student not found.");

    const archivedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: student.userId }, data: { status: UserStatus.INACTIVE } }),
      this.prisma.studentProfile.update({ where: { id }, data: { currentStatus: UserStatus.INACTIVE, isArchived: true, archivedAt } }),
      this.prisma.authSession.updateMany({
        where: { userId: student.userId, status: AuthSessionStatus.ACTIVE },
        data: { status: AuthSessionStatus.REVOKED, revokedAt: archivedAt }
      })
    ]);

    await this.logAudit("ARCHIVE_STUDENT", "StudentProfile", id);
    return { ok: true };
  }

  async reactivate(id: string, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    const student = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!student) throw new NotFoundException("Student not found.");

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: student.userId }, data: { status: UserStatus.ACTIVE } }),
      this.prisma.studentProfile.update({ where: { id }, data: { currentStatus: UserStatus.ACTIVE } })
    ]);

    await this.logAudit("REACTIVATE_STUDENT", "StudentProfile", id);
    return { ok: true };
  }

  async resetPassword(id: string, dto: ResetStudentPasswordDto, user: AuthUser) {
    await this.campusScope.assertStudentInScope(user, id);
    const student = await this.prisma.studentProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!student) throw new NotFoundException("Student not found.");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: student.userId }, data: { passwordHash } }),
      this.prisma.authSession.updateMany({
        where: { userId: student.userId, status: AuthSessionStatus.ACTIVE },
        data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
      })
    ]);

    await this.logAudit("RESET_STUDENT_PASSWORD", "StudentProfile", id);
    return { ok: true };
  }

  /** Enqueue a bulk import so password hashing + inserts run off the request thread. Returns a job to poll. */
  async queueBulkImport(dto: BulkCreateStudentsDto, user: AuthUser) {
    const job = await this.queues.enqueueSystemJob(STUDENT_BULK_IMPORT_JOB, {
      students: dto.students as unknown as Prisma.InputJsonValue,
      requestedById: user.id
    });
    await this.logAudit("QUEUE_BULK_CREATE_STUDENTS", "BackgroundJobRecord", job.id, { total: dto.students.length });
    return { job: this.toImportJobObject(job) };
  }

  async getImportJob(jobId: string, user: AuthUser) {
    const job = await this.prisma.backgroundJobRecord.findFirst({
      where: { id: jobId, jobName: STUDENT_BULK_IMPORT_JOB }
    });
    if (!job) throw new NotFoundException("Import job not found.");
    // BackgroundJobRecord has no campus column; a scoped admin may only read a job
    // they themselves queued (its results contain student roll numbers).
    if (!isInstitutionWideAdmin(user)) {
      const requestedById = (job.payload as { requestedById?: string } | null)?.requestedById;
      if (requestedById !== user.id) throw new NotFoundException("Import job not found.");
    }
    return { job: this.toImportJobObject(job) };
  }

  /** Worker-side executor (called by SystemProcessor). Creates students one-by-one with live progress. */
  async executeBulkImport(jobId: string, students: CreateStudentDto[], requestedById?: string) {
    const total = students.length;
    const created: string[] = [];
    const errors: { rollNumber: string; message: string }[] = [];
    const actor = requestedById ? ({ id: requestedById } as AuthUser) : undefined;

    await this.writeBulkImportProgress(jobId, { phase: "importing", processed: 0, total, percent: total ? 8 : 100 });

    let processed = 0;
    for (const student of students) {
      try {
        const result = await this.create(student, actor);
        created.push(result.student.id);
      } catch (error) {
        errors.push({
          rollNumber: student.rollNumber,
          message: error instanceof Error ? error.message : "Student import failed."
        });
      }
      processed += 1;
      if (processed === total || processed % 5 === 0) {
        await this.writeBulkImportProgress(jobId, {
          phase: "importing",
          processed,
          total,
          percent: total ? Math.min(99, 8 + Math.round((processed / total) * 91)) : 100
        });
      }
    }

    await this.logAudit("BULK_CREATE_STUDENTS", "StudentProfile", undefined, { created: created.length, errors: errors.length });
    return { ok: true, total, created: created.length, errors: errors.slice(0, 100) };
  }

  private async writeBulkImportProgress(jobId: string, progress: BulkImportProgress) {
    const existing = await this.prisma.backgroundJobRecord.findUnique({ where: { id: jobId }, select: { result: true } });
    const prev = (existing?.result ?? {}) as Record<string, unknown>;
    await this.prisma.backgroundJobRecord.update({
      where: { id: jobId },
      data: { result: { ...prev, progress } as Prisma.InputJsonObject }
    });
  }

  private toImportJobObject(job: {
    id: string;
    status: string;
    result: Prisma.JsonValue | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const result = (job.result ?? {}) as {
      progress?: BulkImportProgress;
      total?: number;
      created?: number;
      errors?: { rollNumber: string; message: string }[];
    };
    return {
      id: job.id,
      status: job.status,
      progress: result.progress ?? { phase: "queued", processed: 0, total: 0, percent: 6 },
      total: result.total ?? null,
      created: result.created ?? null,
      errors: result.errors ?? [],
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString()
    };
  }

  private async getSectionWithCampus(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } }
    });

    if (
      !section ||
      section.status !== StructureStatus.ACTIVE ||
      section.class.status !== StructureStatus.ACTIVE ||
      section.class.batch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.program.status !== StructureStatus.ACTIVE
    ) {
      throw new BadRequestException("Section does not exist or is archived.");
    }
    return section;
  }

  private async validateRequestedStructure(
    section: Awaited<ReturnType<StudentsService["getSectionWithCampus"]>>,
    dto: Pick<CreateStudentDto, "batchId" | "branchId" | "campusId" | "classId" | "programId" | "semester"> & { campusId?: string }
  ) {
    const program = section.class.batch.branch.program;
    const studentCampusId = dto.campusId?.trim();
    if (!studentCampusId) {
      throw new BadRequestException("Campus is required.");
    }
    const studentCampus = await this.sharedGroup.loadCampus(studentCampusId);
    if (!studentCampus || studentCampus.status !== StructureStatus.ACTIVE) {
      throw new BadRequestException("Campus does not exist or is archived.");
    }
    this.sharedGroup.assertStudentOperationalCampusMatchesSection(program, studentCampus);
    if (dto.programId && dto.programId !== section.class.batch.branch.programId) throw new BadRequestException("Department does not match selected section.");
    if (dto.branchId && dto.branchId !== section.class.batch.branchId) throw new BadRequestException("Branch does not match selected section.");
    if (dto.batchId && dto.batchId !== section.class.batchId) throw new BadRequestException("Batch does not match selected section.");
    if (dto.classId && dto.classId !== section.classId) throw new BadRequestException("Class does not match selected section.");
    if (dto.semester && dto.semester !== section.class.semesterNumber) throw new BadRequestException("Semester does not match selected class.");
  }

  private toStudentObject(student: {
    id: string;
    rollNumber: string;
    dateOfBirth: Date | null;
    fatherName: string | null;
    currentStatus: UserStatus;
    createdBy?: { id: string; fullName: string; username: string | null; type: UserType } | null;
    user: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      campusId: string | null;
      status: UserStatus;
      campus?: { id: string; code: string; name: string } | null;
    };
    section: {
      id: string;
      name: string;
      class: {
        id: string;
        label: string;
        semesterNumber: number;
        batch: { id: string; startYear: number; endYear: number; branch: { id: string; code: string; program: { id: string; code: string; campus: { id: string; code: string } } } };
      };
    };
  }) {
    return {
      id: student.id,
      currentSectionId: student.section.id,
      identity: {
        fullName: student.user.fullName,
        email: student.user.email.endsWith("@students.local") ? null : student.user.email,
        phone: student.user.phone,
        dateOfBirth: student.dateOfBirth ? formatIstDate(student.dateOfBirth) : null,
        fatherName: student.fatherName,
        rollNumber: student.rollNumber,
        status: student.currentStatus
      },
      createdBy: student.createdBy
        ? {
            id: student.createdBy.id,
            fullName: student.createdBy.fullName,
            username: student.createdBy.username,
            type: student.createdBy.type
          }
        : null,
      structure: {
        currentSectionId: student.section.id,
        campus: student.user.campus ?? student.section.class.batch.branch.program.campus,
        operationalCampus: student.user.campus,
        structureCampus: student.section.class.batch.branch.program.campus,
        program: student.section.class.batch.branch.program,
        branch: student.section.class.batch.branch,
        batch: student.section.class.batch,
        class: student.section.class,
        section: student.section
      }
    };
  }

  private async logAudit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}

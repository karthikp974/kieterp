import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PermissionAction, Prisma, StructureStatus, TeacherRoleKind, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { normalizeCode, normalizeName } from "../core/structure.util";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  getActiveTeacherProfile,
  loadTeacherPortalManagedSections,
  type TeacherSectionOption
} from "./teacher-portal-section-scope.util";
import { TeacherCreateSubjectDto, TeacherUpdateSubjectDto } from "./teacher-subjects-portal.dto";

const subjectInclude = {
  branch: { include: { program: { include: { campus: true } } } },
  batch: true
} satisfies Prisma.SubjectInclude;

@Injectable()
export class TeacherPortalSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  /** Section picker for the teacher Subjects page (only the sections this teacher owns). */
  async getSetup(user: AuthUser) {
    const sections = await this.eligibleSections(user);
    return { sections };
  }

  async listSubjects(user: AuthUser, sectionId: string, semesterNumber?: number) {
    await this.assertOwnsSection(user, sectionId);
    const rows = await this.prisma.sectionSubjectAssignment.findMany({
      where: {
        sectionId,
        isActive: true,
        subject: {
          status: StructureStatus.ACTIVE,
          isArchived: false,
          ...(semesterNumber != null ? { semesterNumber } : {})
        }
      },
      include: { subject: { include: subjectInclude } },
      orderBy: { subject: { code: "asc" } }
    });
    return { items: rows.map((row) => this.toSubject(row.subject)) };
  }

  async createSubject(user: AuthUser, dto: TeacherCreateSubjectDto) {
    const section = await this.assertOwnsSection(user, dto.sectionId);
    const branchId = section.class.batch.branchId;
    const batchId = section.class.batchId;
    const semesterNumber = dto.semesterNumber;
    const code = normalizeCode(dto.subjectCode);
    await this.ensureCodeAvailable(code);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const subject = await tx.subject.create({
          data: {
            branchId,
            batchId,
            semesterNumber,
            name: normalizeName(dto.subjectName),
            code
          },
          include: subjectInclude
        });
        const matchingSections = await tx.section.findMany({
          where: {
            status: StructureStatus.ACTIVE,
            isArchived: false,
            class: { batchId, semesterNumber, batch: { branchId } }
          },
          select: { id: true }
        });
        const sectionIds = new Set(matchingSections.map((s) => s.id));
        sectionIds.add(dto.sectionId);
        if (sectionIds.size) {
          await tx.sectionSubjectAssignment.createMany({
            data: [...sectionIds].map((sectionId) => ({ sectionId, subjectId: subject.id })),
            skipDuplicates: true
          });
        }
        return subject;
      });
      await this.audit(user, "TEACHER_CREATE_SUBJECT", created.id, { code: created.code, name: created.name, sectionId: dto.sectionId });
      return { subject: this.toSubject(created) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Subject code already exists.");
      }
      throw error;
    }
  }

  async updateSubject(user: AuthUser, subjectId: string, dto: TeacherUpdateSubjectDto) {
    await this.assertOwnsSubject(user, subjectId);
    const code = dto.subjectCode ? normalizeCode(dto.subjectCode) : undefined;
    if (code) await this.ensureCodeAvailable(code, subjectId);
    try {
      const updated = await this.prisma.subject.update({
        where: { id: subjectId },
        data: {
          name: dto.subjectName ? normalizeName(dto.subjectName) : undefined,
          code
        },
        include: subjectInclude
      });
      await this.audit(user, "TEACHER_UPDATE_SUBJECT", updated.id, { code: updated.code, name: updated.name });
      return { subject: this.toSubject(updated) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Subject code already exists.");
      }
      throw error;
    }
  }

  async archiveSubject(user: AuthUser, subjectId: string) {
    await this.assertOwnsSubject(user, subjectId);
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.sectionSubjectAssignment.updateMany({ where: { subjectId, isActive: true }, data: { isActive: false } });
      await tx.subject.update({
        where: { id: subjectId },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
      });
    });
    await this.audit(user, "TEACHER_ARCHIVE_SUBJECT", subjectId);
    return { ok: true as const };
  }

  // ----- scope + ownership -----

  private assertTeacher(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
  }

  /** Sections this teacher manages (CTPO/STPO required — pure HTPO has no Subjects page). */
  private async eligibleSections(user: AuthUser): Promise<TeacherSectionOption[]> {
    this.assertTeacher(user);
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const roles = new Set(teacher.assignments.map((a) => a.role));
    if (!roles.has(TeacherRoleKind.CTPO) && !roles.has(TeacherRoleKind.STPO)) {
      throw new ForbiddenException("Subjects management is available to class and subject teachers only.");
    }
    return loadTeacherPortalManagedSections(this.prisma, this.permissions, user, teacher, PermissionAction.MARK_ATTENDANCE);
  }

  private async assertOwnsSection(user: AuthUser, sectionId: string) {
    const sections = await this.eligibleSections(user);
    if (!sections.some((s) => s.id === sectionId)) {
      throw new ForbiddenException("You cannot manage subjects for this section.");
    }
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, status: StructureStatus.ACTIVE, isArchived: false },
      include: { class: { include: { batch: true } } }
    });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private async assertOwnsSubject(user: AuthUser, subjectId: string) {
    const sections = await this.eligibleSections(user);
    const sectionIds = sections.map((s) => s.id);
    if (!sectionIds.length) throw new ForbiddenException("You cannot manage subjects.");
    const link = await this.prisma.sectionSubjectAssignment.findFirst({
      where: { subjectId, sectionId: { in: sectionIds }, isActive: true }
    });
    if (!link) throw new ForbiddenException("You cannot manage this subject — it is not in your sections.");
  }

  private async ensureCodeAvailable(code: string, excludeId?: string) {
    const existing = await this.prisma.subject.findFirst({ where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException("Subject code already exists.");
  }

  private toSubject(subject: Prisma.SubjectGetPayload<{ include: typeof subjectInclude }>) {
    const program = subject.branch.program;
    const semesterYear = Math.ceil(subject.semesterNumber / 2);
    const semesterPart = subject.semesterNumber % 2 === 0 ? 2 : 1;
    return {
      id: subject.id,
      subjectName: subject.name,
      subjectCode: subject.code,
      semester: subject.semesterNumber,
      semesterLabel: `${semesterYear}.${semesterPart}`,
      branch: { id: subject.branch.id, code: subject.branch.code, name: subject.branch.name },
      department: { id: program.id, code: program.code, name: program.name },
      campus: { id: program.campus.id, code: program.campus.code, name: program.campus.name }
    };
  }

  private async audit(user: AuthUser, action: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { userId: user.auditUserId, action, entity: "Subject", entityId, metadata } });
  }
}

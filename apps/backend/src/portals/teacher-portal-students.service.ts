import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus, TeacherRoleKind } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "../students/students.service";
import { BulkCreateStudentsDto, CreateStudentDto, ResetStudentPasswordDto, StudentListQueryDto, UpdateStudentDto } from "../students/students.dto";

type ScopeAssignment = {
  role: TeacherRoleKind;
  campusId: string | null;
  programId: string | null;
  branchId: string | null;
  batchId: string | null;
  classId: string | null;
  sectionId: string | null;
};

type AccessibleSection = { id: string; label: string; name: string; campusId: string };

const sectionInclude = {
  campus: true,
  class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
} satisfies Prisma.SectionInclude;

/**
 * Student management scoped to a teacher's own sections (HTPO = branch, CTPO = their
 * section). STPO has no student-management access. Delegates the actual writes to the
 * admin StudentsService, but only after asserting the target section/student is inside
 * the teacher's accessible scope — so a teacher can never touch a student outside it.
 */
@Injectable()
export class TeacherPortalStudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService
  ) {}

  /** Sections the teacher may manage students in, with campus + label for the form dropdowns. */
  async setup(user: AuthUser) {
    const sections = await this.accessibleSections(user);
    return {
      campusId: user.campusId ?? sections[0]?.campusId ?? null,
      sections: sections.map((s) => ({ id: s.id, label: s.label, campusId: s.campusId }))
    };
  }

  /** Structure catalogs limited to sections the teacher may enroll students in. */
  async catalog(user: AuthUser) {
    const sections = await this.accessibleSections(user);
    const sectionIds = sections.map((s) => s.id);
    if (!sectionIds.length) {
      return { campuses: [], programs: [], branches: [], batches: [], classes: [], sections: [] };
    }

    const rows = await this.prisma.section.findMany({
      where: { id: { in: sectionIds }, status: StructureStatus.ACTIVE, isArchived: false },
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    const campusMap = new Map<string, { id: string; code: string; name: string }>();
    const programMap = new Map<string, { id: string; code: string; name: string; campusId: string }>();
    const branchMap = new Map<string, { id: string; code: string; name: string; programId: string }>();
    const batchMap = new Map<string, { id: string; startYear: number; endYear: number; branchId: string }>();
    const classMap = new Map<string, { id: string; label: string; semesterNumber: number; batchId: string }>();
    const sectionMap = new Map<string, { id: string; name: string; classId: string }>();

    for (const section of rows) {
      const campus = section.campus;
      const program = section.class.batch.branch.program;
      const branch = section.class.batch.branch;
      const batch = section.class.batch;
      const cls = section.class;

      campusMap.set(campus.id, { id: campus.id, code: campus.code, name: campus.name });
      programMap.set(program.id, { id: program.id, code: program.code, name: program.name, campusId: program.campusId });
      branchMap.set(branch.id, { id: branch.id, code: branch.code, name: branch.name, programId: branch.programId });
      batchMap.set(batch.id, { id: batch.id, startYear: batch.startYear, endYear: batch.endYear, branchId: batch.branchId });
      classMap.set(cls.id, { id: cls.id, label: cls.label, semesterNumber: cls.semesterNumber, batchId: cls.batchId });
      sectionMap.set(section.id, { id: section.id, name: section.name, classId: section.classId });
    }

    return {
      campuses: [...campusMap.values()],
      programs: [...programMap.values()],
      branches: [...branchMap.values()],
      batches: [...batchMap.values()],
      classes: [...classMap.values()],
      sections: [...sectionMap.values()]
    };
  }

  async get(user: AuthUser, id: string) {
    await this.assertStudentInScope(user, id);
    return this.students.getById(id);
  }

  async list(user: AuthUser, query: StudentListQueryDto) {
    const sections = await this.accessibleSections(user);
    const accessibleIds = sections.map((s) => s.id);
    if (query.sectionId && !accessibleIds.includes(query.sectionId)) {
      throw new ForbiddenException("That section is outside your scope.");
    }
    const scopeWhere: Prisma.StudentProfileWhereInput = query.sectionId
      ? {}
      : { sectionId: { in: accessibleIds.length ? accessibleIds : ["__none__"] } };
    return this.students.list(query, user, scopeWhere);
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    const section = await this.assertSectionInScope(user, dto.sectionId);
    // Default the operational campus to the section's campus when the client omits it.
    const payload: CreateStudentDto = { ...dto, campusId: dto.campusId?.trim() || section.campusId };
    return this.students.create(payload, user);
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    await this.assertStudentInScope(user, id);
    if (dto.sectionId) {
      await this.assertSectionInScope(user, dto.sectionId);
    }
    return this.students.update(id, dto, user);
  }

  async deactivate(user: AuthUser, id: string) {
    await this.assertStudentInScope(user, id);
    return this.students.deactivate(id, user);
  }

  async archive(user: AuthUser, id: string) {
    await this.assertStudentInScope(user, id);
    return this.students.archive(id, user);
  }

  async reactivate(user: AuthUser, id: string) {
    await this.assertStudentInScope(user, id);
    return this.students.reactivate(id, user);
  }

  async resetPassword(user: AuthUser, id: string, dto: ResetStudentPasswordDto) {
    await this.assertStudentInScope(user, id);
    return this.students.resetPassword(id, dto, user);
  }

  async bulk(user: AuthUser, dto: BulkCreateStudentsDto) {
    const sections = await this.accessibleSections(user);
    const accessibleIds = new Set(sections.map((s) => s.id));
    const sectionCampus = new Map(sections.map((s) => [s.id, s.campusId]));
    const rows = dto.students.map((row) => {
      if (!accessibleIds.has(row.sectionId)) {
        throw new ForbiddenException(`Section for roll ${row.rollNumber} is outside your scope.`);
      }
      return { ...row, campusId: row.campusId?.trim() || sectionCampus.get(row.sectionId)! };
    });
    return this.students.queueBulkImport({ students: rows }, user);
  }

  getImportJob(user: AuthUser, jobId: string) {
    return this.students.getImportJob(jobId, user);
  }

  // --- scope enforcement ---

  private async assertSectionInScope(user: AuthUser, sectionId: string): Promise<AccessibleSection> {
    const sections = await this.accessibleSections(user);
    const match = sections.find((s) => s.id === sectionId);
    if (!match) throw new ForbiddenException("That section is outside your scope.");
    return match;
  }

  private async assertStudentInScope(user: AuthUser, studentProfileId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: { sectionId: true }
    });
    if (!student) throw new NotFoundException("Student not found.");
    const sections = await this.accessibleSections(user);
    if (!sections.some((s) => s.id === student.sectionId)) {
      throw new ForbiddenException("That student is outside your scope.");
    }
  }

  /** Resolve the concrete set of sections a teacher's HTPO/CTPO assignments cover. */
  private async accessibleSections(user: AuthUser): Promise<AccessibleSection[]> {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, batchId: true, classId: true, sectionId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");

    const manageAssignments = teacher.assignments.filter(
      (a) => a.role === TeacherRoleKind.HTPO || a.role === TeacherRoleKind.CTPO
    );
    if (!manageAssignments.length) {
      throw new ForbiddenException("Student management is available to branch heads and class teachers only.");
    }

    const OR = manageAssignments.map((a) => this.sectionWhereForAssignment(a));
    const sections = await this.prisma.section.findMany({
      where: { status: StructureStatus.ACTIVE, isArchived: false, OR },
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    return sections.map((section) => ({
      id: section.id,
      name: section.name,
      campusId: section.campusId,
      label: `${section.class.batch.branch.code} · Sem ${section.class.semesterNumber} · ${section.name}`
    }));
  }

  private sectionWhereForAssignment(a: ScopeAssignment): Prisma.SectionWhereInput {
    if (a.sectionId) return { id: a.sectionId };
    if (a.classId) return { classId: a.classId };
    if (a.batchId) return { class: { batchId: a.batchId } };
    if (a.branchId) return { class: { batch: { branchId: a.branchId } } };
    if (a.programId) return { class: { batch: { branch: { programId: a.programId } } } };
    if (a.campusId) return { campusId: a.campusId };
    return { id: "__none__" };
  }
}

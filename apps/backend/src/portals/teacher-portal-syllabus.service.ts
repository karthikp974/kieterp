import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PermissionAction, Prisma, StructureStatus, TeacherRoleKind, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { computeSectionSyllabusProgress } from "../syllabus/syllabus-progress.util";
import {
  getActiveTeacherProfile,
  expandCtpoClassSectionIds,
  loadTeacherPortalManagedSections,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext,
  type TeacherSectionOption
} from "./teacher-portal-section-scope.util";
import { formatTeacherSectionLabel } from "../common/teacher-section-label.util";
import { formatSemesterLabel } from "../common/semester-label.util";
import {
  TeacherSyllabusCreateSyllabusDto,
  TeacherSyllabusTopicBodyDto,
  TeacherSyllabusUnitBodyDto
} from "./teacher-syllabus-portal.dto";

type SubjectOption = { id: string; code: string; name: string; label: string; sectionId: string; semesterNumber: number };

const subjectSectionInclude = {
  class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
} satisfies Prisma.SectionInclude;

@Injectable()
export class TeacherPortalSyllabusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async getSetup(user: AuthUser) {
    this.assertTeacher(user);
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    this.assertSyllabusRole(teacher);

    const baseSections = await this.eligibleSections(user, teacher);
    const subjects = await this.loadAssignedSubjects(user.id, teacher.assignments, { allowEmpty: true });
    const sectionsWithSubjects = await this.sectionsFromSubjectLinks(user, subjects, baseSections);

    const sectionRows = sectionsWithSubjects.length
      ? await this.prisma.section.findMany({
          where: { id: { in: sectionsWithSubjects.map((section) => section.id) }, isArchived: false, status: StructureStatus.ACTIVE },
          include: subjectSectionInclude,
          orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
        })
      : [];
    const sectionLabels = new Map(
      sectionRows.map((section) => [section.id, formatTeacherSectionLabel(section)])
    );
    const syllabusSections = sectionsWithSubjects.map((section) => ({
      ...section,
      label: sectionLabels.get(section.id) ?? section.label
    }));
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, syllabusSections);
    return {
      mode: ctx.mode,
      roles: ctx.roles,
      showSectionFilter: ctx.showSectionFilter,
      sections: ctx.sections,
      fixedSectionId: ctx.fixedSectionId,
      subjects
    };
  }

  async listSubjects(user: AuthUser) {
    this.assertTeacher(user);
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const subjects = await this.loadAssignedSubjects(user.id, teacher.assignments);
    return { subjects };
  }

  async listSectionSubjects(user: AuthUser, sectionId: string, semesterNumber: number) {
    this.assertTeacher(user);
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    this.assertSyllabusRole(teacher);
    await this.assertTeacherOwnsSection(user, sectionId);

    const assigned = await this.loadAssignedSubjects(user.id, teacher.assignments, { allowEmpty: true });
    const inSection = assigned.filter(
      (subject) => subject.sectionId === sectionId && subject.semesterNumber === semesterNumber
    );
    if (inSection.length) {
      return { subjects: inSection };
    }

    // Fall back to the subjects actually assigned to THIS section for the chosen
    // semester — the same source the completion gate (assertSubjectInSection) checks.
    // Semesters with no section assignments return an empty list, so the dropdown
    // never offers a subject that would 403 when opened.
    const sectionSubjects = await this.loadSectionAssignedSubjects(sectionId, semesterNumber);
    return { subjects: sectionSubjects };
  }

  /** Subjects assigned to a section for a specific semester (matches the completion gate). */
  private async loadSectionAssignedSubjects(sectionId: string, semesterNumber: number): Promise<SubjectOption[]> {
    const rows = await this.prisma.sectionSubjectAssignment.findMany({
      where: {
        sectionId,
        isActive: true,
        subject: { status: StructureStatus.ACTIVE, isArchived: false, semesterNumber }
      },
      include: { subject: true },
      orderBy: { subject: { code: "asc" } }
    });
    return rows.map((row) => ({
      id: row.subject.id,
      code: row.subject.code,
      name: row.subject.name,
      label: `${row.subject.code} — ${row.subject.name}`,
      sectionId,
      semesterNumber: row.subject.semesterNumber
    }));
  }

  async getSubjectSyllabus(user: AuthUser, subjectId: string) {
    await this.assertTeacherOwnsSubject(user, subjectId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, status: StructureStatus.ACTIVE, isArchived: false }
    });
    if (!subject) throw new NotFoundException("Subject not found.");

    const syllabus = await this.prisma.syllabus.findFirst({
      where: { subjectId, isArchived: false },
      include: {
        units: {
          where: { isArchived: false },
          orderBy: { unitOrder: "asc" },
          include: {
            topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } }
          }
        }
      }
    });

    if (!syllabus) {
      return {
        exists: false as const,
        subject: { id: subject.id, code: subject.code, name: subject.name }
      };
    }

    return {
      exists: true as const,
      subject: { id: subject.id, code: subject.code, name: subject.name },
      syllabus: {
        id: syllabus.id,
        units: syllabus.units.map((unit) => ({
          id: unit.id,
          unitTitle: unit.unitTitle,
          unitOrder: unit.unitOrder,
          topics: unit.topics.map((topic) => ({
            id: topic.id,
            topicTitle: topic.topicTitle,
            topicOrder: topic.topicOrder
          }))
        }))
      }
    };
  }

  async createSyllabus(user: AuthUser, subjectId: string, dto: TeacherSyllabusCreateSyllabusDto) {
    await this.assertTeacherOwnsSubject(user, subjectId);
    const existing = await this.prisma.syllabus.findFirst({ where: { subjectId, isArchived: false } });
    if (existing) throw new ConflictException("Syllabus already exists for this subject.");

    const unitTitle = dto.initialUnitTitle?.trim() || "Unit 1";
    const created = await this.prisma.syllabus.create({
      data: {
        subjectId,
        units: {
          create: {
            unitTitle,
            unitOrder: 1,
            topics: { create: [] }
          }
        }
      },
      include: {
        units: {
          where: { isArchived: false },
          orderBy: { unitOrder: "asc" },
          include: { topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } } }
        }
      }
    });

    return this.mapSyllabusResponse(created);
  }

  async createUnit(user: AuthUser, subjectId: string, dto: TeacherSyllabusUnitBodyDto) {
    const syllabus = await this.loadEditableSyllabus(user, subjectId);
    const title = this.cleanTitle(dto.unitTitle);
    const maxOrder = await this.prisma.syllabusUnit.aggregate({
      where: { syllabusId: syllabus.id, isArchived: false },
      _max: { unitOrder: true }
    });
    const unit = await this.prisma.syllabusUnit.create({
      data: {
        syllabusId: syllabus.id,
        unitTitle: title,
        unitOrder: dto.unitOrder ?? (maxOrder._max.unitOrder ?? 0) + 1
      }
    });
    return { unit: { id: unit.id, unitTitle: unit.unitTitle, unitOrder: unit.unitOrder, topics: [] } };
  }

  async updateUnit(user: AuthUser, unitId: string, dto: TeacherSyllabusUnitBodyDto) {
    const unit = await this.loadEditableUnit(user, unitId);
    const updated = await this.prisma.syllabusUnit.update({
      where: { id: unit.id },
      data: {
        unitTitle: this.cleanTitle(dto.unitTitle),
        ...(dto.unitOrder != null ? { unitOrder: dto.unitOrder } : {})
      }
    });
    return { unit: { id: updated.id, unitTitle: updated.unitTitle, unitOrder: updated.unitOrder } };
  }

  async archiveUnit(user: AuthUser, unitId: string) {
    const unit = await this.loadEditableUnit(user, unitId);
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.syllabusTopic.updateMany({
        where: { unitId: unit.id, isArchived: false },
        data: { isArchived: true, archivedAt }
      });
      await tx.syllabusUnit.update({
        where: { id: unit.id },
        data: { isArchived: true, archivedAt }
      });
    });
    return { ok: true as const };
  }

  async createTopic(user: AuthUser, unitId: string, dto: TeacherSyllabusTopicBodyDto) {
    const unit = await this.loadEditableUnit(user, unitId);
    const title = this.cleanTitle(dto.topicTitle);
    const maxOrder = await this.prisma.syllabusTopic.aggregate({
      where: { unitId: unit.id, isArchived: false },
      _max: { topicOrder: true }
    });
    const topic = await this.prisma.syllabusTopic.create({
      data: {
        unitId: unit.id,
        topicTitle: title,
        topicOrder: dto.topicOrder ?? (maxOrder._max.topicOrder ?? 0) + 1
      }
    });
    return { topic: { id: topic.id, topicTitle: topic.topicTitle, topicOrder: topic.topicOrder } };
  }

  async updateTopic(user: AuthUser, topicId: string, dto: TeacherSyllabusTopicBodyDto) {
    const topic = await this.loadEditableTopic(user, topicId);
    const updated = await this.prisma.syllabusTopic.update({
      where: { id: topic.id },
      data: {
        topicTitle: this.cleanTitle(dto.topicTitle),
        ...(dto.topicOrder != null ? { topicOrder: dto.topicOrder } : {})
      }
    });
    return { topic: { id: updated.id, topicTitle: updated.topicTitle, topicOrder: updated.topicOrder } };
  }

  async archiveTopic(user: AuthUser, topicId: string) {
    const topic = await this.loadEditableTopic(user, topicId);
    await this.prisma.syllabusTopic.update({
      where: { id: topic.id },
      data: { isArchived: true, archivedAt: new Date() }
    });
    return { ok: true as const };
  }

  async listSemesters(user: AuthUser, sectionId: string) {
    await this.assertTeacherOwnsSection(user, sectionId);
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: { class: { include: { batch: { include: { branch: true } } } } }
    });
    if (!section) throw new NotFoundException("Section not found.");
    const durationYears = section.class.batch.branch.durationYears ?? 4;
    const maxSemester = Math.max(1, durationYears * 2);
    return {
      sectionId: section.id,
      currentSemesterNumber: section.class.semesterNumber,
      semesters: Array.from({ length: maxSemester }, (_, index) => ({
        value: index + 1,
        label: formatSemesterLabel(index + 1)
      }))
    };
  }

  async getCompletionChecklist(
    user: AuthUser,
    sectionId: string,
    subjectId: string,
    semesterNumber?: number
  ) {
    await this.assertTeacherOwnsSection(user, sectionId);
    await this.assertTeacherOwnsSubject(user, subjectId);
    await this.assertSubjectInSection(sectionId, subjectId, semesterNumber);

    const syllabus = await this.prisma.syllabus.findFirst({
      where: { subjectId, isArchived: false },
      include: {
        units: {
          where: { isArchived: false },
          orderBy: { unitOrder: "asc" },
          include: { topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } } }
        }
      }
    });
    if (!syllabus) {
      return {
        sectionId,
        subjectId,
        progress: {
          progressPercent: 0,
          completedUnits: 0,
          totalUnits: 0,
          completedTopics: 0,
          totalTopics: 0,
          hasSyllabus: false
        },
        units: [] as {
          id: string;
          unitTitle: string;
          unitOrder: number;
          topics: { id: string; topicTitle: string; topicOrder: number; isCompleted: boolean }[];
        }[]
      };
    }

    const topicIds = syllabus.units.flatMap((unit) => unit.topics.map((topic) => topic.id));
    const completions =
      topicIds.length === 0
        ? []
        : await this.prisma.sectionSyllabusTopicCompletion.findMany({
            where: { sectionId, topicId: { in: topicIds } },
            select: { topicId: true, isCompleted: true }
          });
    const completedMap = new Map(completions.map((row) => [row.topicId, row.isCompleted]));
    const progress = await computeSectionSyllabusProgress(this.prisma, sectionId, subjectId);

    return {
      sectionId,
      subjectId,
      semesterNumber: semesterNumber ?? null,
      progress,
      units: syllabus.units.map((unit) => ({
        id: unit.id,
        unitTitle: unit.unitTitle,
        unitOrder: unit.unitOrder,
        topics: unit.topics.map((topic) => ({
          id: topic.id,
          topicTitle: topic.topicTitle,
          topicOrder: topic.topicOrder,
          isCompleted: completedMap.get(topic.id) === true
        }))
      }))
    };
  }

  async setTopicCompletion(user: AuthUser, dto: { sectionId: string; topicId: string; isCompleted: boolean }) {
    const topic = await this.prisma.syllabusTopic.findFirst({
      where: { id: dto.topicId, isArchived: false },
      include: { unit: { include: { syllabus: { select: { subjectId: true, isArchived: true } } } } }
    });
    if (!topic || topic.unit.syllabus.isArchived) {
      throw new NotFoundException("Topic not found.");
    }

    const subjectId = topic.unit.syllabus.subjectId;
    await this.assertTeacherOwnsSection(user, dto.sectionId);
    await this.assertTeacherOwnsSubject(user, subjectId);
    await this.assertSubjectInSection(dto.sectionId, subjectId);

    await this.prisma.sectionSyllabusTopicCompletion.upsert({
      where: { sectionId_topicId: { sectionId: dto.sectionId, topicId: dto.topicId } },
      create: {
        sectionId: dto.sectionId,
        topicId: dto.topicId,
        isCompleted: dto.isCompleted,
        updatedById: user.id
      },
      update: { isCompleted: dto.isCompleted, updatedById: user.id }
    });

    const progress = await computeSectionSyllabusProgress(this.prisma, dto.sectionId, subjectId);
    return { ok: true as const, progress };
  }

  private assertTeacher(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
  }

  /** Syllabus is scoped to class/subject teachers — same section scope as the Subjects page. */
  private assertSyllabusRole(teacher: { assignments: { role: TeacherRoleKind }[] }) {
    const roles = new Set(teacher.assignments.map((assignment) => assignment.role));
    if (!roles.has(TeacherRoleKind.CTPO) && !roles.has(TeacherRoleKind.STPO)) {
      throw new ForbiddenException("Syllabus management is available to class and subject teachers only.");
    }
  }

  private async eligibleSections(user: AuthUser, teacher: Awaited<ReturnType<typeof getActiveTeacherProfile>>) {
    return loadTeacherPortalManagedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.MARK_ATTENDANCE
    );
  }

  /**
   * STPO teachers may have subjectId on their role assignment but no sectionId.
   * Sections still exist in the DB — resolve them from SectionSubjectAssignment links.
   */
  private async sectionsFromSubjectLinks(
    user: AuthUser,
    subjects: SubjectOption[],
    assignedSections: TeacherSectionOption[]
  ): Promise<TeacherSectionOption[]> {
    const byId = new Map(assignedSections.map((section) => [section.id, section]));
    const missingIds = [...new Set(subjects.map((subject) => subject.sectionId))].filter((id) => !byId.has(id));
    if (!missingIds.length) {
      return assignedSections;
    }

    const rows = await this.prisma.section.findMany({
      where: { id: { in: missingIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: subjectSectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    for (const section of rows) {
      const scope = {
        campusId: section.campusId,
        programId: section.class.batch.branch.programId,
        branchId: section.class.batch.branchId,
        batchId: section.class.batchId ?? undefined,
        classId: section.classId,
        sectionId: section.id
      };
      if (this.permissions.can(user, { action: PermissionAction.MARK_ATTENDANCE, scope }).allowed) {
        byId.set(section.id, {
          id: section.id,
          name: section.name,
          label: formatTeacherSectionLabel(section)
        });
      }
    }

    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  private cleanTitle(value: string) {
    const title = value.trim().replace(/\s+/g, " ");
    if (!title) throw new BadRequestException("Title is required.");
    return title;
  }

  private mapSyllabusResponse(syllabus: {
    id: string;
    units: {
      id: string;
      unitTitle: string;
      unitOrder: number;
      topics: { id: string; topicTitle: string; topicOrder: number }[];
    }[];
  }) {
    return {
      exists: true as const,
      syllabus: {
        id: syllabus.id,
        units: syllabus.units.map((unit) => ({
          id: unit.id,
          unitTitle: unit.unitTitle,
          unitOrder: unit.unitOrder,
          topics: unit.topics.map((topic) => ({
            id: topic.id,
            topicTitle: topic.topicTitle,
            topicOrder: topic.topicOrder
          }))
        }))
      }
    };
  }

  private addAssignedSubject(
    subjectMap: Map<string, SubjectOption>,
    subject: { id: string; code: string; name: string; semesterNumber: number },
    sectionId: string
  ) {
    subjectMap.set(`${sectionId}:${subject.id}`, {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      label: `${subject.code} — ${subject.name}`,
      sectionId,
      semesterNumber: subject.semesterNumber
    });
  }

  /** Branch + semester curriculum when SectionSubjectAssignment rows are missing. */
  private async loadCurriculumSubjectsForSection(sectionId: string, semesterNumber?: number): Promise<SubjectOption[]> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: { class: { include: { batch: true } } }
    });
    if (!section) return [];

    const targetSemester = semesterNumber ?? section.class.semesterNumber;
    const subjects = await this.prisma.subject.findMany({
      where: {
        branchId: section.class.batch.branchId,
        semesterNumber: targetSemester,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        OR: [{ batchId: section.class.batchId }, { batchId: null }]
      },
      orderBy: { code: "asc" }
    });

    return subjects.map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      label: `${subject.code} — ${subject.name}`,
      sectionId,
      semesterNumber: subject.semesterNumber
    }));
  }

  private async loadAssignedSubjects(
    userId: string,
    assignments: {
      role: TeacherRoleKind;
      sectionId: string | null;
      subjectId: string | null;
    }[],
    options?: { allowEmpty?: boolean }
  ): Promise<SubjectOption[]> {
    const subjectMap = new Map<string, SubjectOption>();
    const stpoAssignments = assignments.filter((a) => a.role === TeacherRoleKind.STPO && a.subjectId);
    const ctpoSectionIds = assignments
      .filter((a) => a.role === TeacherRoleKind.CTPO && a.sectionId)
      .map((a) => a.sectionId!);

    if (stpoAssignments.length) {
      const stpoWithSection = stpoAssignments.filter((a) => a.sectionId);
      const stpoBareIds = stpoAssignments.filter((a) => !a.sectionId).map((a) => a.subjectId!);

      if (stpoWithSection.length) {
        const rows = await this.prisma.sectionSubjectAssignment.findMany({
          where: {
            OR: stpoWithSection.map((a) => ({ sectionId: a.sectionId!, subjectId: a.subjectId!, isActive: true })),
            subject: { status: StructureStatus.ACTIVE, isArchived: false },
            section: { isArchived: false, status: StructureStatus.ACTIVE }
          },
          include: { subject: true },
          orderBy: { subject: { code: "asc" } }
        });
        for (const row of rows) {
          this.addAssignedSubject(subjectMap, row.subject, row.sectionId);
        }
      }

      if (stpoBareIds.length) {
        const rows = await this.prisma.sectionSubjectAssignment.findMany({
          where: {
            subjectId: { in: [...new Set(stpoBareIds)] },
            isActive: true,
            subject: { status: StructureStatus.ACTIVE, isArchived: false },
            section: { isArchived: false, status: StructureStatus.ACTIVE }
          },
          include: { subject: true },
          orderBy: [{ sectionId: "asc" }, { subject: { code: "asc" } }]
        });
        for (const row of rows) {
          const assignment = stpoAssignments.find((a) => a.subjectId === row.subjectId && !a.sectionId);
          if (!assignment) continue;
          this.addAssignedSubject(subjectMap, row.subject, row.sectionId);
        }
      }
    }

    if (ctpoSectionIds.length) {
      const managedSectionIds = await expandCtpoClassSectionIds(this.prisma, ctpoSectionIds);
      const rows = await this.prisma.sectionSubjectAssignment.findMany({
        where: {
          sectionId: { in: managedSectionIds },
          isActive: true,
          subject: { status: StructureStatus.ACTIVE, isArchived: false },
          section: { isArchived: false, status: StructureStatus.ACTIVE }
        },
        include: { subject: true },
        orderBy: [{ sectionId: "asc" }, { subject: { code: "asc" } }]
      });
      for (const row of rows) {
        this.addAssignedSubject(subjectMap, row.subject, row.sectionId);
      }
      if (!rows.length) {
        for (const managedSectionId of managedSectionIds) {
          for (const subject of await this.loadCurriculumSubjectsForSection(managedSectionId)) {
            this.addAssignedSubject(subjectMap, subject, managedSectionId);
          }
        }
      }
    }

    if (!subjectMap.size && !options?.allowEmpty) {
      throw new ForbiddenException("No assigned subjects found for syllabus management.");
    }

    return [...subjectMap.values()].sort((a, b) =>
      a.sectionId.localeCompare(b.sectionId) || a.code.localeCompare(b.code)
    );
  }

  private async assertTeacherOwnsSubject(user: AuthUser, subjectId: string) {
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const subjects = await this.loadAssignedSubjects(user.id, teacher.assignments, { allowEmpty: true });
    if (subjects.some((subject) => subject.id === subjectId)) {
      return;
    }

    // Validate against the subject's OWN semester (not just the section's current
    // semester) so coordinators can open any curriculum subject the dropdown lists,
    // including past semesters — keeping access consistent with listSectionSubjects.
    const subjectRow = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { semesterNumber: true }
    });

    const sections = await this.eligibleSections(user, teacher);
    for (const section of sections) {
      const curriculum = await this.loadCurriculumSubjectsForSection(section.id, subjectRow?.semesterNumber);
      if (curriculum.some((subject) => subject.id === subjectId)) {
        return;
      }
    }

    throw new ForbiddenException("You are not assigned to manage this subject syllabus.");
  }

  private async assertTeacherOwnsSection(user: AuthUser, sectionId: string) {
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    this.assertSyllabusRole(teacher);
    const sections = await this.eligibleSections(user, teacher);
    if (!sections.some((section) => section.id === sectionId)) {
      throw new ForbiddenException("You cannot access syllabus completion for this section.");
    }
  }

  private async assertSubjectInSection(sectionId: string, subjectId: string, semesterNumber?: number) {
    const assign = await this.prisma.sectionSubjectAssignment.findFirst({
      where: { sectionId, subjectId, isActive: true },
      include: { subject: true }
    });
    if (!assign) {
      throw new ForbiddenException("This section is not assigned this subject.");
    }
    if (semesterNumber != null && assign.subject.semesterNumber !== semesterNumber) {
      throw new BadRequestException("Selected semester does not match this subject curriculum.");
    }
  }

  private async loadEditableSyllabus(user: AuthUser, subjectId: string) {
    await this.assertTeacherOwnsSubject(user, subjectId);
    const syllabus = await this.prisma.syllabus.findFirst({ where: { subjectId, isArchived: false } });
    if (!syllabus) throw new NotFoundException("Syllabus not found. Add syllabus first.");
    return syllabus;
  }

  private async loadEditableUnit(user: AuthUser, unitId: string) {
    const unit = await this.prisma.syllabusUnit.findFirst({
      where: { id: unitId, isArchived: false },
      include: { syllabus: { select: { subjectId: true, isArchived: true } } }
    });
    if (!unit || unit.syllabus.isArchived) throw new NotFoundException("Unit not found.");
    await this.assertTeacherOwnsSubject(user, unit.syllabus.subjectId);
    return unit;
  }

  private async loadEditableTopic(user: AuthUser, topicId: string) {
    const topic = await this.prisma.syllabusTopic.findFirst({
      where: { id: topicId, isArchived: false },
      include: { unit: { include: { syllabus: { select: { subjectId: true, isArchived: true } } } } }
    });
    if (!topic || topic.unit.syllabus.isArchived) throw new NotFoundException("Topic not found.");
    await this.assertTeacherOwnsSubject(user, topic.unit.syllabus.subjectId);
    return topic;
  }
}

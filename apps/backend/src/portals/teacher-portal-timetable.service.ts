import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PermissionAction, Prisma, StructureStatus, TeacherRoleKind, TimetableSlotStatus, UserStatus, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildSectionTimetableGridRows } from "../timetable/build-section-timetable-grid";
import { HTPO_SECTION_TIMETABLE_DAYS } from "../timetable/timetable-grid.constants";
import { formatTimeRange24Label, normalizeTimeTo24h } from "../timetable/normalize-timetable-time";
import { TimetableService } from "../timetable/timetable.service";
import { TeacherAssignSubjectTeacherDto, TeacherTimetableAddSlotsDto } from "./teacher-timetable-portal.dto";
import {
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext
} from "./teacher-portal-section-scope.util";

const DAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: {
      include: {
        batch: {
          include: {
            branch: { include: { program: { include: { campus: true } } } };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class TeacherPortalTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly timetable: TimetableService
  ) {}

  async getSetup(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    if (!this.permissions.can(user, { action: PermissionAction.VIEW_TEACHER_PORTAL }).allowed) {
      throw new ForbiddenException("Timetable is not available for this role.");
    }

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.MANAGE_TIMETABLE
    );
    const viewSections =
      sections.length > 0
        ? sections
        : await loadTeacherAssignedSections(
            this.prisma,
            this.permissions,
            user,
            teacher,
            PermissionAction.VIEW_TEACHER_PORTAL
          );
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, viewSections);

    return {
      mode: ctx.mode,
      roles: ctx.roles,
      showSectionFilter: ctx.showSectionFilter,
      sections: ctx.sections,
      fixedSectionId: ctx.fixedSectionId
    };
  }

  async listSupervisionSections(user: AuthUser) {
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.MANAGE_TIMETABLE
    );
    const viewSections =
      sections.length > 0
        ? sections
        : await loadTeacherAssignedSections(
            this.prisma,
            this.permissions,
            user,
            teacher,
            PermissionAction.VIEW_TEACHER_PORTAL
          );

    return {
      sections: viewSections.map((section) => ({
        id: section.id,
        label: section.label
      }))
    };
  }

  async getSectionTimetableGrid(user: AuthUser, sectionId: string) {
    const section = await this.loadSectionTree(sectionId);

    const scope = this.sectionToScope(section);
    const canView = this.permissions.can(user, { action: PermissionAction.VIEW_TEACHER_PORTAL, scope }).allowed;
    if (!canView) throw new ForbiddenException("You cannot view this section timetable.");

    const canEdit = this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed;

    const slots = await this.prisma.timetableSlot.findMany({
      where: { sectionId: section.id, status: TimetableSlotStatus.ACTIVE },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        teacherProfile: { include: { user: { select: { fullName: true } } } }
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    const subjects = await this.prisma.subject.findMany({
      where: {
        branchId: section.class.branchId,
        semesterNumber: section.class.semesterNumber,
        status: StructureStatus.ACTIVE,
        isArchived: false
      },
      orderBy: [{ code: "asc" }]
    });

    const rows = buildSectionTimetableGridRows(slots);

    const prog = section.class.batch.branch.program;

    return {
      section: {
        id: section.id,
        label: this.sectionLabel(section),
        name: section.name,
        semesterNumber: section.class.semesterNumber,
        scope: {
          campusId: section.campusId,
          programId: prog.id,
          branchId: section.class.branchId,
          batchId: section.class.batchId,
          classId: section.classId,
          sectionId: section.id
        }
      },
      canEdit,
      days: HTPO_SECTION_TIMETABLE_DAYS.map((d) => ({ dayOfWeek: d.dayOfWeek, label: d.label })),
      rows,
      subjects: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, semesterNumber: s.semesterNumber }))
    };
  }

  async listSubjectTeacherRows(user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    const htpoAssignments = teacher.assignments.filter((assignment) => assignment.role === TeacherRoleKind.HTPO);
    if (!htpoAssignments.length) {
      return { rows: [] as const };
    }

    const sections = await this.loadHtpoSupervisionSectionTrees(user);
    const rows: {
      id: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      sectionId: string;
      sectionLabel: string;
      stpoTeacherId: string | null;
      stpoTeacherName: string | null;
    }[] = [];

    for (const section of sections) {
      const subjects = await this.subjectsForSection(section);
      if (!subjects.length) continue;

      const assignments = await this.prisma.teacherRoleAssignment.findMany({
        where: {
          role: TeacherRoleKind.STPO,
          sectionId: section.id,
          isActive: true,
          subjectId: { in: subjects.map((subject) => subject.id) }
        },
        include: { teacherProfile: { include: { user: { select: { fullName: true } } } } }
      });
      const bySubject = new Map(assignments.map((assignment) => [assignment.subjectId!, assignment]));

      for (const subject of subjects) {
        const assignment = bySubject.get(subject.id);
        rows.push({
          id: `${section.id}:${subject.id}`,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          sectionId: section.id,
          sectionLabel: this.sectionShortLabel(section),
          stpoTeacherId: assignment?.teacherProfileId ?? null,
          stpoTeacherName: assignment?.teacherProfile?.user.fullName ?? null
        });
      }
    }

    rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.sectionLabel.localeCompare(b.sectionLabel));
    return { rows };
  }

  async getAssignSubjectTeacherOptions(user: AuthUser, pickSectionId?: string, pickSubjectId?: string) {
    const sections = await this.loadHtpoSupervisionSectionTrees(user);
    const manageableSections: SectionTree[] = [];

    const subjectMap = new Map<string, { id: string; code: string; name: string; label: string }>();
    const sectionSubjectIds = new Map<string, Set<string>>();

    for (const section of sections) {
      const scope = this.sectionToScope(section);
      if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
        continue;
      }
      manageableSections.push(section);

      const sectionSubjects = await this.subjectsForSection(section);
      const ids = new Set<string>();
      for (const subject of sectionSubjects) {
        ids.add(subject.id);
        if (!subjectMap.has(subject.id)) {
          subjectMap.set(subject.id, {
            id: subject.id,
            code: subject.code,
            name: subject.name,
            label: `${subject.name} (${subject.code})`
          });
        }
      }
      sectionSubjectIds.set(section.id, ids);
    }

    const subjects = [...subjectMap.values()].sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

    const resolvedSubjectId =
      pickSubjectId && subjectMap.has(pickSubjectId) ? pickSubjectId : subjects[0]?.id ?? null;

    const sectionOptions = manageableSections
      .filter((section) => !resolvedSubjectId || sectionSubjectIds.get(section.id)?.has(resolvedSubjectId))
      .map((section) => ({ id: section.id, label: this.sectionLabel(section) }));

    let activeSection: SectionTree | undefined;
    if (pickSectionId) {
      activeSection = manageableSections.find(
        (section) =>
          section.id === pickSectionId &&
          (!resolvedSubjectId || sectionSubjectIds.get(section.id)?.has(resolvedSubjectId))
      );
      if (!activeSection) throw new NotFoundException("Section not found in your HTPO scope for this subject.");
    } else if (sectionOptions.length) {
      activeSection = manageableSections.find((section) => section.id === sectionOptions[0]!.id);
    }

    let teachers: { id: string; label: string }[] = [];
    let selectedTeacherId: string | null = null;

    if (activeSection && resolvedSubjectId) {
      teachers = await this.teachersEligibleForSectionSubject(activeSection, resolvedSubjectId);

      const current = await this.prisma.teacherRoleAssignment.findFirst({
        where: {
          role: TeacherRoleKind.STPO,
          sectionId: activeSection.id,
          subjectId: resolvedSubjectId,
          isActive: true
        },
        select: { teacherProfileId: true }
      });
      selectedTeacherId = current?.teacherProfileId ?? null;
    }

    return {
      sections: sectionOptions,
      subjects,
      teachers,
      selectedSectionId: activeSection?.id ?? null,
      selectedSubjectId: resolvedSubjectId,
      selectedTeacherId
    };
  }

  async assignSubjectTeacher(user: AuthUser, dto: TeacherAssignSubjectTeacherDto) {
    const section = await this.loadSectionTree(dto.sectionId);
    const scope = this.sectionToScope(section);
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
      throw new ForbiddenException("You cannot assign teachers for this section.");
    }

    const subjectLink = await this.prisma.sectionSubjectAssignment.findFirst({
      where: { sectionId: dto.sectionId, subjectId: dto.subjectId, isActive: true }
    });
    if (!subjectLink) {
      const fallback = await this.prisma.subject.findFirst({
        where: {
          id: dto.subjectId,
          branchId: section.class.branchId,
          semesterNumber: section.class.semesterNumber,
          status: StructureStatus.ACTIVE,
          isArchived: false
        }
      });
      if (!fallback) throw new BadRequestException("Subject is not part of this section curriculum.");
    }

    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: dto.teacherProfileId, isArchived: false, user: { status: UserStatus.ACTIVE } },
      select: { id: true, userId: true }
    });
    if (!teacher) throw new NotFoundException("Teacher not found.");

    const eligible = await this.teachersEligibleForSectionSubject(section, dto.subjectId);
    if (!eligible.some((row) => row.id === dto.teacherProfileId)) {
      throw new BadRequestException("Selected teacher is not registered as STPO for this section and subject.");
    }

    const assignmentInput = {
      role: TeacherRoleKind.STPO,
      campusId: section.campusId,
      programId: section.class.batch.branch.programId,
      branchId: section.class.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id,
      subjectId: dto.subjectId
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherRoleAssignment.updateMany({
        where: {
          role: TeacherRoleKind.STPO,
          sectionId: section.id,
          subjectId: dto.subjectId,
          isActive: true
        },
        data: { isActive: false }
      });

      await tx.teacherRoleAssignment.create({
        data: {
          teacherProfileId: teacher.id,
          userId: teacher.userId,
          ...assignmentInput
        }
      });

      await tx.timetableSlot.updateMany({
        where: {
          sectionId: section.id,
          subjectId: dto.subjectId,
          status: TimetableSlotStatus.ACTIVE
        },
        data: { teacherProfileId: teacher.id }
      });
    });

    return { ok: true };
  }

  async unassignSubjectTeacher(user: AuthUser, sectionId: string, subjectId: string) {
    const section = await this.loadSectionTree(sectionId);
    const scope = this.sectionToScope(section);
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
      throw new ForbiddenException("You cannot assign teachers for this section.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teacherRoleAssignment.updateMany({
        where: {
          role: TeacherRoleKind.STPO,
          sectionId: section.id,
          subjectId,
          isActive: true
        },
        data: { isActive: false }
      });

      if (result.count > 0) {
        await tx.timetableSlot.updateMany({
          where: {
            sectionId: section.id,
            subjectId,
            status: TimetableSlotStatus.ACTIVE
          },
          data: { teacherProfileId: null }
        });
      }

      return result.count;
    });

    if (!updated) throw new NotFoundException("No teacher assignment found for this subject.");
    return { ok: true };
  }

  async listYourTimetable(user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    const stpoScopes = teacher.assignments.filter(
      (assignment) => assignment.role === TeacherRoleKind.STPO && assignment.sectionId && assignment.subjectId
    );

    const orFilters: Prisma.TimetableSlotWhereInput[] = [{ teacherProfileId: teacher.id }];
    for (const scope of stpoScopes) {
      orFilters.push({ sectionId: scope.sectionId!, subjectId: scope.subjectId! });
    }

    const slots = await this.prisma.timetableSlot.findMany({
      where: { status: TimetableSlotStatus.ACTIVE, OR: orFilters },
      include: {
        subject: { select: { code: true, name: true } },
        section: {
          include: {
            class: {
              select: {
                semesterNumber: true,
                label: true,
                branch: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    const seen = new Set<string>();
    const rows = [];
    for (const slot of slots) {
      if (seen.has(slot.id)) continue;
      seen.add(slot.id);
      rows.push({
        id: slot.id,
        sectionLabel: `${slot.section.class.branch.name} · ${slot.section.name}`,
        semesterLabel: slot.section.class.label?.trim() || `Sem ${slot.section.class.semesterNumber}`,
        subjectName: slot.subject ? `${slot.subject.name}` : "General",
        subjectCode: slot.subject?.code ?? null,
        timePeriod: `${DAY_LABELS[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`} · ${formatTimeRange24Label(slot.startTime, slot.endTime)}`
      });
    }

    return { rows };
  }

  async addSlots(user: AuthUser, sectionId: string, dto: TeacherTimetableAddSlotsDto) {
    const section = await this.loadSectionTree(sectionId);
    const scope = this.sectionToScope(section);
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
      throw new ForbiddenException("You cannot edit timetable for this section.");
    }

    if (!dto.allDays && !dto.dayOfWeek) {
      throw new BadRequestException("Select a day or choose All days.");
    }
    const days = dto.allDays
      ? HTPO_SECTION_TIMETABLE_DAYS.map((d) => d.dayOfWeek)
      : [dto.dayOfWeek!];

    const created: string[] = [];
    const errors: string[] = [];

    for (const dayOfWeek of days) {
      for (const entry of dto.entries) {
        const startTime = normalizeTimeTo24h(entry.startTime);
        const endTime = normalizeTimeTo24h(entry.endTime);
        if (!startTime || !endTime) {
          errors.push(`Invalid time format for ${entry.startTime}-${entry.endTime}. Use HH:mm (24-hour).`);
          continue;
        }
        if (startTime >= endTime) {
          errors.push(`Invalid time range ${startTime}-${endTime}.`);
          continue;
        }
        try {
          const result = await this.timetable.create(user, {
            ...scope,
            subjectId: entry.subjectId,
            dayOfWeek,
            startTime,
            endTime,
            room: entry.room,
            slotType: entry.slotType
          });
          created.push(result.slot.id);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Slot could not be created.");
        }
      }
    }

    return {
      createdCount: created.length,
      createdIds: created,
      errors: errors.length ? errors : undefined
    };
  }

  async archiveSlot(user: AuthUser, sectionId: string, slotId: string) {
    const section = await this.loadSectionTree(sectionId);
    const scope = this.sectionToScope(section);
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
      throw new ForbiddenException("You cannot edit timetable for this section.");
    }

    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id: slotId, sectionId: section.id, status: TimetableSlotStatus.ACTIVE }
    });
    if (!slot) throw new NotFoundException("Timetable slot not found.");

    return this.timetable.archive(user, slotId);
  }

  async archivePeriod(user: AuthUser, sectionId: string, startTime: string, endTime: string) {
    const section = await this.loadSectionTree(sectionId);
    const scope = this.sectionToScope(section);
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope }).allowed) {
      throw new ForbiddenException("You cannot edit timetable for this section.");
    }

    const slots = await this.prisma.timetableSlot.findMany({
      where: {
        sectionId: section.id,
        status: TimetableSlotStatus.ACTIVE,
        startTime,
        endTime
      },
      select: { id: true }
    });
    if (!slots.length) throw new NotFoundException("No timetable slots found for this time period.");

    for (const slot of slots) {
      await this.timetable.archive(user, slot.id);
    }

    return { ok: true, archivedCount: slots.length };
  }

  private async loadSectionTree(sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: {
        class: {
          include: {
            batch: {
              include: {
                branch: { include: { program: { include: { campus: true } } } }
              }
            }
          }
        }
      }
    });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private async getActiveTeacher(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, sectionId: true, subjectId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    return teacher;
  }

  private async loadHtpoSupervisionSectionTrees(user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    const htpoAssignments = teacher.assignments.filter((assignment) => assignment.role === TeacherRoleKind.HTPO);
    if (!htpoAssignments.length) return [] as SectionTree[];

    return this.prisma.section.findMany({
      where: this.sectionsWhereForHtpo(htpoAssignments),
      include: {
        class: {
          include: {
            batch: { include: { branch: { include: { program: { include: { campus: true } } } } } }
          }
        }
      },
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
  }

  private async subjectsForSection(section: SectionTree) {
    const linked = await this.prisma.sectionSubjectAssignment.findMany({
      where: { sectionId: section.id, isActive: true },
      include: { subject: true }
    });
    const subjects = linked
      .map((row) => row.subject)
      .filter((subject) => subject.status === StructureStatus.ACTIVE && !subject.isArchived)
      .sort((a, b) => a.code.localeCompare(b.code));
    if (subjects.length) return subjects;

    return this.prisma.subject.findMany({
      where: {
        branchId: section.class.branchId,
        semesterNumber: section.class.semesterNumber,
        status: StructureStatus.ACTIVE,
        isArchived: false
      },
      orderBy: [{ code: "asc" }]
    });
  }

  private sectionShortLabel(section: SectionTree) {
    return `Sem ${section.class.semesterNumber} · ${section.name}`;
  }

  private sectionsWhereForHtpo(
    assignments: { campusId: string | null; programId: string | null; branchId: string | null }[]
  ): Prisma.SectionWhereInput {
    const OR = assignments.map((a) => {
      const branchFilter: Prisma.BranchWhereInput = {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(a.branchId ? { id: a.branchId } : {}),
        ...(a.programId ? { programId: a.programId } : {})
      };
      return {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(a.campusId ? { campusId: a.campusId } : {}),
        class: { status: StructureStatus.ACTIVE, isArchived: false, branch: branchFilter }
      };
    });
    return OR.length ? { OR } : { id: "__none__" };
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
      branchId: section.class.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id
    };
  }

  /** Teachers with an active STPO role on this exact section + subject (admin-registered). */
  private async teachersEligibleForSectionSubject(section: SectionTree, subjectId: string) {
    const rows = await this.prisma.teacherRoleAssignment.findMany({
      where: {
        isActive: true,
        role: TeacherRoleKind.STPO,
        sectionId: section.id,
        subjectId,
        teacherProfile: {
          isArchived: false,
          user: { status: UserStatus.ACTIVE, campusId: section.campusId }
        }
      },
      include: { teacherProfile: { include: { user: { select: { fullName: true } } } } },
      orderBy: { teacherProfile: { user: { fullName: "asc" } } }
    });

    const seen = new Set<string>();
    const teachers: { id: string; label: string }[] = [];
    for (const row of rows) {
      if (seen.has(row.teacherProfileId)) continue;
      seen.add(row.teacherProfileId);
      teachers.push({
        id: row.teacherProfileId,
        label: row.teacherProfile.user.fullName
      });
    }
    return teachers;
  }
}

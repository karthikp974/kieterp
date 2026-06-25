import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  PermissionAction,
  Prisma,
  StructureStatus,
  TeacherRoleKind,
  UserStatus,
  UserType
} from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { formatTeacherSectionLabel } from "../common/teacher-section-label.util";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";

export type TeacherSectionOption = { id: string; label: string; name: string };

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
  };
}>;

type ActiveTeacher = {
  assignments: {
    role: TeacherRoleKind;
    campusId: string | null;
    programId: string | null;
    branchId: string | null;
    sectionId: string | null;
  }[];
};

export type TeacherEngageContext = {
  mode: "htpo" | "ctpo" | "stpo" | "teacher";
  roles: TeacherRoleKind[];
  showSectionFilter: boolean;
  canManageFeedback: boolean;
  canManageAnnouncements: boolean;
  sections: TeacherSectionOption[];
  sectionIds: string[];
  primarySectionId: string | null;
  fixedSectionId: string | null;
};

const sectionInclude = {
  class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
} satisfies Prisma.SectionInclude;

function sectionLabel(section: SectionTree) {
  return formatTeacherSectionLabel(section);
}

function sectionToScope(section: SectionTree): ScopeRef {
  return {
    campusId: section.campusId,
    programId: section.class.batch.branch.programId,
    branchId: section.class.batch.branchId,
    batchId: section.class.batchId ?? undefined,
    classId: section.classId,
    sectionId: section.id
  };
}

function sectionsWhereForHtpo(
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

export async function getActiveTeacherProfile(prisma: PrismaService, userId: string) {
  const teacher = await prisma.teacherProfile.findUnique({
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

export async function loadTeacherAssignedSections(
  prisma: PrismaService,
  permissions: PermissionsService,
  user: AuthUser,
  teacher: ActiveTeacher,
  permissionAction: PermissionAction
): Promise<TeacherSectionOption[]> {
  const roles = [...new Set(teacher.assignments.map((a) => a.role))];
  const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
  const sectionMap = new Map<string, TeacherSectionOption>();

  if (hasHtpo) {
    const sections = await prisma.section.findMany({
      where: sectionsWhereForHtpo(teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO)),
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    for (const section of sections) {
      if (permissions.can(user, { action: permissionAction, scope: sectionToScope(section) }).allowed) {
        sectionMap.set(section.id, { id: section.id, label: sectionLabel(section), name: section.name });
      }
    }
  }

  const roleSectionIds = [
    ...new Set(
      teacher.assignments
        .filter((a) => (a.role === TeacherRoleKind.CTPO || a.role === TeacherRoleKind.STPO) && a.sectionId)
        .map((a) => a.sectionId!)
    )
  ];
  if (roleSectionIds.length) {
    const sections = await prisma.section.findMany({
      where: { id: { in: roleSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    for (const section of sections) {
      if (permissions.can(user, { action: permissionAction, scope: sectionToScope(section) }).allowed) {
        sectionMap.set(section.id, { id: section.id, label: sectionLabel(section), name: section.name });
      }
    }
  }

  if (!hasHtpo && roleSectionIds.length) {
    for (const key of [...sectionMap.keys()]) {
      if (!roleSectionIds.includes(key)) sectionMap.delete(key);
    }
  }

  return [...sectionMap.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Sections a CTPO/STPO teacher can manage in Subjects + Syllabus.
 * CTPO is assigned to one section row but coordinates the whole class — include every section in that class.
 */
export async function loadTeacherPortalManagedSections(
  prisma: PrismaService,
  permissions: PermissionsService,
  user: AuthUser,
  teacher: ActiveTeacher,
  permissionAction: PermissionAction
): Promise<TeacherSectionOption[]> {
  const roles = new Set(teacher.assignments.map((a) => a.role));
  if (roles.has(TeacherRoleKind.HTPO)) {
    return loadTeacherAssignedSections(prisma, permissions, user, teacher, permissionAction);
  }

  const sectionMap = new Map<string, TeacherSectionOption>();
  const addSection = (section: SectionTree) => {
    if (permissions.can(user, { action: permissionAction, scope: sectionToScope(section) }).allowed) {
      sectionMap.set(section.id, { id: section.id, label: sectionLabel(section), name: section.name });
    }
  };

  const roleSectionIds = [
    ...new Set(
      teacher.assignments
        .filter((a) => (a.role === TeacherRoleKind.CTPO || a.role === TeacherRoleKind.STPO) && a.sectionId)
        .map((a) => a.sectionId!)
    )
  ];

  let anchorSections: SectionTree[] = [];
  if (roleSectionIds.length) {
    anchorSections = await prisma.section.findMany({
      where: { id: { in: roleSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    for (const section of anchorSections) addSection(section);
  }

  if (roles.has(TeacherRoleKind.CTPO) && anchorSections.length) {
    const classIds = [...new Set(anchorSections.map((section) => section.classId))];
    const classSections = await prisma.section.findMany({
      where: { classId: { in: classIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: sectionInclude,
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    for (const section of classSections) addSection(section);
  }

  return [...sectionMap.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** All section ids in the same class(es) as the given anchor section(s) — for CTPO subject/syllabus scope. */
export async function expandCtpoClassSectionIds(prisma: PrismaService, anchorSectionIds: string[]): Promise<string[]> {
  if (!anchorSectionIds.length) return [];
  const anchors = await prisma.section.findMany({
    where: { id: { in: anchorSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
    select: { id: true, classId: true }
  });
  const classIds = [...new Set(anchors.map((section) => section.classId))];
  if (!classIds.length) return [...new Set(anchorSectionIds)];

  const classSections = await prisma.section.findMany({
    where: { classId: { in: classIds }, isArchived: false, status: StructureStatus.ACTIVE },
    select: { id: true },
    orderBy: { name: "asc" }
  });
  return [...new Set([...anchorSectionIds, ...classSections.map((section) => section.id)])];
}

export function resolveTeacherEngageContext(
  user: AuthUser,
  permissions: PermissionsService,
  teacher: ActiveTeacher,
  sections: TeacherSectionOption[],
  sectionId?: string
): TeacherEngageContext {
  if (user.type !== UserType.TEACHER) {
    throw new ForbiddenException("Teacher portal only.");
  }

  const roles = [...new Set(teacher.assignments.map((a) => a.role))] as TeacherRoleKind[];
  const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
  const hasCtpo = roles.includes(TeacherRoleKind.CTPO);
  const hasStpo = roles.includes(TeacherRoleKind.STPO);
  const mode = hasHtpo ? "htpo" : hasCtpo ? "ctpo" : hasStpo ? "stpo" : "teacher";
  const accessibleIds = sections.map((s) => s.id);
  const trimmed = sectionId?.trim();

  if (trimmed && !accessibleIds.includes(trimmed)) {
    throw new ForbiddenException("You cannot access data for this section.");
  }

  const canManageFeedback = permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed;
  const canManageAnnouncements = permissions.can(user, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed;

  const showSectionFilter = hasHtpo;
  let sectionIds: string[];
  let primarySectionId: string | null;

  if (hasHtpo) {
    sectionIds = trimmed ? [trimmed] : accessibleIds;
    primarySectionId = trimmed ?? null;
  } else {
    sectionIds = accessibleIds;
    primarySectionId = sections.length === 1 ? sections[0]?.id ?? null : trimmed && accessibleIds.includes(trimmed) ? trimmed : sections[0]?.id ?? null;
    if (trimmed && !hasHtpo) {
      // CTPO/STPO: ignore client section tampering — always use assigned scope
      sectionIds = accessibleIds;
      primarySectionId = sections.length === 1 ? sections[0]?.id ?? null : accessibleIds[0] ?? null;
    }
  }

  const fixedSectionId = !showSectionFilter && sections.length === 1 ? sections[0]?.id ?? null : null;

  return {
    mode,
    roles,
    showSectionFilter,
    canManageFeedback,
    canManageAnnouncements,
    sections,
    sectionIds,
    primarySectionId,
    fixedSectionId
  };
}

/** Forms/announcements targeted at a section (exact sectionId match). */
export function sectionScopedWhere(sectionIds: string[]): Prisma.FeedbackFormWhereInput {
  if (!sectionIds.length) return { id: "__none__" };
  return { sectionId: { in: sectionIds } };
}

export function announcementSectionScopedWhere(sectionIds: string[]): Prisma.AnnouncementWhereInput {
  if (!sectionIds.length) return { id: "__none__" };
  return { sectionId: { in: sectionIds } };
}

export async function scopeForSectionId(prisma: PrismaService, sectionId: string): Promise<ScopeRef> {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
    include: sectionInclude
  });
  if (!section) throw new NotFoundException("Section not found.");
  return sectionToScope(section);
}

export function assertTeacherCanAccessSectionScope(
  user: AuthUser,
  permissions: PermissionsService,
  scope: ScopeRef,
  action: PermissionAction
) {
  const decision = permissions.can(user, { action, scope });
  if (!decision.allowed) throw new ForbiddenException(decision.reason);
}

export function formMatchesSectionIds(
  form: { sectionId: string | null },
  sectionIds: string[]
): boolean {
  if (!sectionIds.length) return false;
  return form.sectionId != null && sectionIds.includes(form.sectionId);
}

export function studentCountForSections(prisma: PrismaService, sectionIds: string[]) {
  if (!sectionIds.length) return Promise.resolve(0);
  return prisma.studentProfile.count({
    where: {
      sectionId: { in: sectionIds },
      isArchived: false,
      currentStatus: UserStatus.ACTIVE
    }
  });
}

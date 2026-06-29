import { StructureStatus, TeacherRoleKind, UserType } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";

type ScopeAssignment = {
  role: TeacherRoleKind;
  campusId: string | null;
  programId: string | null;
  branchId: string | null;
  batchId: string | null;
  classId: string | null;
  sectionId: string | null;
};

/** Section ids a teacher may import results for (HTPO/CTPO assignments only). */
export async function loadTeacherResultImportSectionIds(prisma: PrismaService, userId: string): Promise<string[]> {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId },
    include: {
      assignments: {
        where: { isActive: true },
        select: {
          role: true,
          campusId: true,
          programId: true,
          branchId: true,
          batchId: true,
          classId: true,
          sectionId: true
        }
      }
    }
  });
  if (!teacher || teacher.isArchived) return [];

  const manage = teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO || a.role === TeacherRoleKind.CTPO);
  if (!manage.length) return [];

  const OR = manage.map((a) => sectionWhereForAssignment(a));
  const sections = await prisma.section.findMany({
    where: { status: StructureStatus.ACTIVE, isArchived: false, OR },
    select: { id: true }
  });
  return sections.map((s) => s.id);
}

export function shouldScopeResultImportToTeacherSections(user: AuthUser) {
  return user.type === UserType.TEACHER;
}

function sectionWhereForAssignment(a: ScopeAssignment) {
  if (a.sectionId) return { id: a.sectionId };
  if (a.classId) return { classId: a.classId };
  if (a.batchId) return { class: { batchId: a.batchId } };
  if (a.branchId) return { class: { batch: { branchId: a.branchId } } };
  if (a.programId) return { class: { batch: { branch: { programId: a.programId } } } };
  if (a.campusId) return { campusId: a.campusId };
  return { id: "__none__" };
}

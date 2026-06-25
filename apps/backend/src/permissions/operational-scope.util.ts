import { ForbiddenException } from "@nestjs/common";
import { ProgramStructureScope, Prisma, UserType } from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";

/** Students may only access their own profile-backed records on admin ERP routes. */
export function assertStudentSelfProfile(user: AuthUser, student: { userId: string }) {
  if (user.type === UserType.STUDENT && student.userId !== user.id) {
    throw new ForbiddenException("Students can only access their own records.");
  }
}

/** Shared Prisma include for building operational student scope. */
export const studentScopeProfileInclude = {
  user: { include: { campus: { select: { id: true, code: true, groupId: true } } } },
  section: {
    include: {
      class: {
        include: {
          batch: {
            include: {
              branch: {
                include: {
                  program: { include: { campus: { select: { groupId: true } } } }
                }
              }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.StudentProfileInclude;

/** Minimal program node on an academic section tree. */
export type ScopeProgramNode = {
  campusId: string;
  structureScope?: ProgramStructureScope;
  campus?: { groupId?: string } | null;
};

/** Section → class → batch → branch → program chain used for scope building. */
export type ScopeSectionTree = {
  id: string;
  classId: string;
  class: {
    id: string;
    batchId: string;
    batch: {
      branchId: string;
      branch: {
        id: string;
        programId: string;
        program: ScopeProgramNode;
      };
    };
  };
};

export type ScopeStudentProfile = {
  sectionId: string;
  user?: { campusId?: string | null; campus?: { groupId?: string } | null } | null;
  section: ScopeSectionTree;
};

/** Operational campus = KIET/KIEK label on the person; structure campus = program owner (KIET for shared depts). */
export function operationalCampusIdForStudent(student: ScopeStudentProfile): string {
  return student.user?.campusId ?? student.section.class.batch.branch.program.campusId;
}

export function studentProfileToScope(student: ScopeStudentProfile, subjectId?: string): ScopeRef {
  const branch = student.section.class.batch.branch;
  const program = branch.program;
  const campusGroupId = student.user?.campus?.groupId ?? program.campus?.groupId;
  // GROUP_SHARED programs (KIET+KIEK Diploma/B.Tech/M.Tech) are one academic tree: KIET and KIEK
  // students share the same branch/section. Match by group + shared structure, not the operational
  // campus label — otherwise a KIET teacher could not act on a KIEK student in the same section.
  // CAMPUS_OWNED programs (MBA/MCA, KIEW) keep the campusId so cross-campus access stays blocked.
  const isShared = program.structureScope === ProgramStructureScope.GROUP_SHARED;
  const campusId = isShared ? undefined : operationalCampusIdForStudent(student);
  return {
    ...(campusId ? { campusId } : {}),
    ...(campusGroupId ? { campusGroupId } : {}),
    programId: branch.programId,
    branchId: branch.id,
    batchId: student.section.class.batchId,
    classId: student.section.classId,
    sectionId: student.sectionId,
    subjectId
  };
}

/** Campus ids that should match KIET/KIEK shared targeting (operational + structure owner). */
export function campusIdsForSharedMatching(student: ScopeStudentProfile): string[] {
  const operational = operationalCampusIdForStudent(student);
  const structure = student.section.class.batch.branch.program.campusId;
  return operational === structure ? [operational] : [operational, structure];
}

/**
 * Scope from a section tree. For GROUP_SHARED programs omit campusId unless operational campus is known —
 * so KIET-structure / KIEK-assignment teachers both match on sectionId.
 */
export function sectionTreeToScope(section: ScopeSectionTree, operationalCampusId?: string | null): ScopeRef {
  const branch = section.class.batch.branch;
  const program = branch.program;
  const isShared = program.structureScope === ProgramStructureScope.GROUP_SHARED;
  const campusId = operationalCampusId ?? (isShared ? undefined : program.campusId);
  const campusGroupId = isShared ? program.campus?.groupId : undefined;
  return {
    ...(campusId ? { campusId } : {}),
    ...(campusGroupId ? { campusGroupId } : {}),
    programId: branch.programId,
    branchId: branch.id,
    batchId: section.class.batchId,
    classId: section.classId,
    sectionId: section.id
  };
}

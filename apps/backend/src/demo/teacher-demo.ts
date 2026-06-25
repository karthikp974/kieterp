import { PrismaClient, TeacherRoleKind, UserStatus, UserType } from "@prisma/client";
import bcrypt from "bcrypt";
import { ensureDemoAcademicStructure } from "./demo-academic-structure";

export const DEMO_TEACHER_PASSWORD = "TeacherDemo@123";

export type DemoTeacherPreset = {
  employeeCode: string;
  email: string;
  fullName: string;
  roles: TeacherRoleKind[];
};

/** Sync with `apps/frontend/src/auth/demo-credentials.ts` */
export const DEMO_TEACHER_PRESETS: DemoTeacherPreset[] = [
  { employeeCode: "HTPO001", email: "htpo.demo@teachers.local", fullName: "Demo HTPO", roles: [TeacherRoleKind.HTPO] },
  { employeeCode: "CTPO001", email: "ctpo.demo@teachers.local", fullName: "Demo CTPO", roles: [TeacherRoleKind.CTPO] },
  { employeeCode: "STPO001", email: "stpo.demo@teachers.local", fullName: "Demo STPO", roles: [TeacherRoleKind.STPO] },
  {
    employeeCode: "HTCT001",
    email: "htct.demo@teachers.local",
    fullName: "Demo HTPO + CTPO",
    roles: [TeacherRoleKind.HTPO, TeacherRoleKind.CTPO]
  },
  {
    employeeCode: "HTST001",
    email: "htst.demo@teachers.local",
    fullName: "Demo HTPO + STPO",
    roles: [TeacherRoleKind.HTPO, TeacherRoleKind.STPO]
  },
  {
    employeeCode: "CTST001",
    email: "ctst.demo@teachers.local",
    fullName: "Demo CTPO + STPO",
    roles: [TeacherRoleKind.CTPO, TeacherRoleKind.STPO]
  },
  {
    employeeCode: "ALLT001",
    email: "allt.demo@teachers.local",
    fullName: "Demo HTPO + CTPO + STPO",
    roles: [TeacherRoleKind.HTPO, TeacherRoleKind.CTPO, TeacherRoleKind.STPO]
  }
];

export type EnsureTeacherDemosResult = { ok: true; created: number } | { ok: false; reason: string };

function assignmentScope(role: TeacherRoleKind, scope: { campusId: string; programId: string; branchId: string; batchId: string; classId: string; sectionId: string; subjectId: string }) {
  if (role === TeacherRoleKind.HTPO) {
    return {
      campusId: scope.campusId,
      programId: scope.programId,
      branchId: scope.branchId
    };
  }
  if (role === TeacherRoleKind.CTPO) {
    return {
      campusId: scope.campusId,
      programId: scope.programId,
      branchId: scope.branchId,
      batchId: scope.batchId,
      classId: scope.classId,
      sectionId: scope.sectionId
    };
  }
  return {
    campusId: scope.campusId,
    programId: scope.programId,
    branchId: scope.branchId,
    batchId: scope.batchId,
    classId: scope.classId,
    sectionId: scope.sectionId,
    subjectId: scope.subjectId
  };
}

/**
 * Ensures all teacher role-combination demo accounts exist.
 * Safe to call on every backend start in development.
 */
export async function ensureTeacherDemoAccounts(prisma: PrismaClient): Promise<EnsureTeacherDemosResult> {
  const scope = await ensureDemoAcademicStructure(prisma);
  if (!scope) {
    return { ok: false, reason: "KIET / BTECH / CSC catalog not found — run prisma seed first." };
  }

  const passwordHash = await bcrypt.hash(DEMO_TEACHER_PASSWORD, 12);
  let created = 0;

  for (const preset of DEMO_TEACHER_PRESETS) {
    const user = await prisma.user.upsert({
      where: { email: preset.email },
      update: {
        passwordHash,
        fullName: preset.fullName,
        type: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        campusId: scope.campusId
      },
      create: {
        email: preset.email,
        username: preset.employeeCode.toLowerCase(),
        passwordHash,
        fullName: preset.fullName,
        type: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        campusId: scope.campusId
      }
    });

    const profile = await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      update: {
        employeeCode: preset.employeeCode,
        designation: `${preset.fullName} — Demo`,
        isArchived: false,
        archivedAt: null
      },
      create: {
        userId: user.id,
        employeeCode: preset.employeeCode,
        designation: `${preset.fullName} — Demo`
      }
    });

    await prisma.teacherRoleAssignment.deleteMany({ where: { teacherProfileId: profile.id } });
    for (const role of preset.roles) {
      await prisma.teacherRoleAssignment.create({
        data: {
          teacherProfileId: profile.id,
          userId: user.id,
          role,
          isActive: true,
          ...assignmentScope(role, scope)
        }
      });
    }
    created += 1;
  }

  return { ok: true, created };
}

import {
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTeacherScope,
  FeedbackFormStatus,
  FeedbackFormType,
  FeedbackQuestionType,
  PrismaClient,
  StructureStatus,
  SyllabusResourceKind,
  UserStatus,
  UserType
} from "@prisma/client";
import bcrypt from "bcrypt";
import { ensureDemoAcademicStructure } from "./demo-academic-structure";
import { ensureDemoStudentPortalData } from "./demo-student-portal-data";

/** Sync with `apps/frontend/src/auth/demo-credentials.ts` */
export const DEMO_STUDENT_PASSWORD = "StudentDemo@123";
export const DEMO_STUDENT_ROLL = "22BTECH-AI-001";

export const DEMO_STUDENT_ACCOUNTS = [
  { roll: "22BTECH-AI-001", email: "aanya.demo@students.local", fullName: "Aanya Sharma", username: "aanya_demo" },
  { roll: "22BTECH-AI-002", email: "rohan.demo@students.local", fullName: "Rohan Mehta", username: "rohan_demo" },
  { roll: "22MCA-001", email: "kavya.demo@students.local", fullName: "Kavya Nair", username: "kavya_demo" }
] as const;

/** @deprecated Use DEMO_STUDENT_ACCOUNTS[0].email */
export const DEMO_STUDENT_EMAIL = DEMO_STUDENT_ACCOUNTS[0].email;

export function isDemoStudentLoginAttempt(identifier: string, password: string) {
  if (password !== DEMO_STUDENT_PASSWORD) return false;
  const normalized = identifier.trim().toUpperCase();
  return DEMO_STUDENT_ACCOUNTS.some((account) => account.roll.toUpperCase() === normalized);
}

export type EnsureDemoStudentResult = { ok: true } | { ok: false; reason: string };

/**
 * Ensures a demo student exists (KIET catalog, first active section under BTECH / CSC).
 * Safe to call on every backend start in development.
 */
export async function ensureDemoStudent(prisma: PrismaClient): Promise<EnsureDemoStudentResult> {
  const scope = await ensureDemoAcademicStructure(prisma);
  if (!scope) {
    return { ok: false, reason: "KIET / BTECH / CSC not found — run prisma seed for catalog." };
  }

  const section = await prisma.section.findUnique({ where: { id: scope.sectionId } });
  if (!section) {
    return { ok: false, reason: "Demo section missing after structure bootstrap." };
  }

  const passwordHash = await bcrypt.hash(DEMO_STUDENT_PASSWORD, 12);
  let primaryUserId: string | null = null;

  for (const account of DEMO_STUDENT_ACCOUNTS) {
    const existingByRoll = await prisma.studentProfile.findFirst({
      where: { rollNumber: { equals: account.roll, mode: "insensitive" } },
      select: { userId: true }
    });

    const demoUser = existingByRoll
      ? await prisma.user.update({
          where: { id: existingByRoll.userId },
          data: {
            passwordHash,
            fullName: account.fullName,
            username: account.username,
            type: UserType.STUDENT,
            status: UserStatus.ACTIVE,
            campusId: scope.campusId
          }
        })
      : await prisma.user.upsert({
          where: { email: account.email },
          update: {
            passwordHash,
            fullName: account.fullName,
            username: account.username,
            type: UserType.STUDENT,
            status: UserStatus.ACTIVE,
            campusId: scope.campusId
          },
          create: {
            email: account.email,
            username: account.username,
            passwordHash,
            fullName: account.fullName,
            type: UserType.STUDENT,
            status: UserStatus.ACTIVE,
            campusId: scope.campusId
          }
        });

    await prisma.studentProfile.upsert({
      where: { userId: demoUser.id },
      update: {
        sectionId: section.id,
        rollNumber: account.roll,
        currentStatus: UserStatus.ACTIVE,
        isArchived: false,
        archivedAt: null,
        guardianName: "Demo Guardian",
        fatherName: "Demo Father",
        address: null
      },
      create: {
        userId: demoUser.id,
        sectionId: section.id,
        rollNumber: account.roll,
        currentStatus: UserStatus.ACTIVE,
        guardianName: "Demo Guardian",
        fatherName: "Demo Father",
        address: null
      }
    });

    if (account.roll === DEMO_STUDENT_ROLL) {
      primaryUserId = demoUser.id;
      await prisma.user.update({
        where: { id: demoUser.id },
        data: { phone: "9876543210" }
      });
    }
  }

  const demoUser = primaryUserId ? await prisma.user.findUniqueOrThrow({ where: { id: primaryUserId } }) : null;
  if (!demoUser) {
    return { ok: false, reason: "Primary demo student missing after bootstrap." };
  }

  try {
    const unreadWelcome = await prisma.studentPortalNotification.findFirst({
      where: { userId: demoUser.id, title: "Welcome to the Student Portal" }
    });
    if (!unreadWelcome) {
      await prisma.studentPortalNotification.create({
        data: {
          userId: demoUser.id,
          title: "Welcome to the Student Portal",
          body: "This is a demo notification so the bell badge appears. Feature pages will arrive in upcoming milestones."
        }
      });
    }
  } catch {
    /* Table may not exist until migrations are applied. */
  }

  try {
    const academicClass = await prisma.academicClass.findUnique({ where: { id: scope.classId } });
    if (academicClass) {
      await seedDemoStudentAcademics(prisma, section.id, academicClass.semesterNumber, scope.branchId, scope.batchId);
    }
  } catch {
    /* Syllabus tables may be missing until migrations are applied. */
  }

  try {
    const adminUser =
      (await prisma.user.findFirst({ where: { type: UserType.ADMIN, status: UserStatus.ACTIVE } })) ?? demoUser;
    const demoAnnTitle = "Welcome — Student portal announcements";
    const existingAnn = await prisma.announcement.findFirst({ where: { title: demoAnnTitle, sectionId: section.id } });
    if (!existingAnn) {
      await prisma.announcement.create({
        data: {
          title: demoAnnTitle,
          body: "This notice is scoped to your section. Open Announcements to read details and mark items as read. New notices appear here after refresh.",
          audience: AnnouncementAudience.STUDENTS,
          status: AnnouncementStatus.PUBLISHED,
          priority: AnnouncementPriority.NORMAL,
          pinned: true,
          campusId: scope.campusId,
          programId: scope.programId,
          branchId: scope.branchId,
          batchId: scope.batchId,
          classId: scope.classId,
          sectionId: section.id,
          teacherScope: AnnouncementTeacherScope.NONE,
          createdById: adminUser.id,
          publishedAt: new Date()
        }
      });
    }
  } catch {
    /* Announcements table may be missing until migrations are applied. */
  }

  try {
    const adminUser =
      (await prisma.user.findFirst({ where: { type: UserType.ADMIN, status: UserStatus.ACTIVE } })) ?? demoUser;
    const demoFbTitle = "Demo — Guest lecture feedback";
    const existingFb = await prisma.feedbackForm.findFirst({ where: { title: demoFbTitle, sectionId: section.id } });
    if (!existingFb) {
      const startsAt = new Date();
      startsAt.setDate(startsAt.getDate() - 2);
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + 14);
      await prisma.feedbackForm.create({
        data: {
          title: demoFbTitle,
          description: "Share your feedback on the recent guest lecture. All required questions must be answered.",
          formType: FeedbackFormType.GUEST_LECTURE,
          campusId: scope.campusId,
          programId: scope.programId,
          branchId: scope.branchId,
          batchId: scope.batchId,
          classId: scope.classId,
          sectionId: section.id,
          startsAt,
          endsAt,
          status: FeedbackFormStatus.ACTIVE,
          createdById: adminUser.id,
          questions: {
            create: [
              {
                order: 1,
                type: FeedbackQuestionType.RATING_SCALE,
                prompt: "Overall session quality",
                required: true,
                options: { minLabel: "Poor", maxLabel: "Excellent" }
              },
              {
                order: 2,
                type: FeedbackQuestionType.YES_NO,
                prompt: "Would you recommend similar sessions?",
                required: true
              },
              {
                order: 3,
                type: FeedbackQuestionType.PARAGRAPH,
                prompt: "What did you learn?",
                required: true
              }
            ]
          }
        }
      });
    }
  } catch {
    /* Feedback tables may be missing until migrations are applied. */
  }

  try {
    await ensureDemoStudentPortalData(prisma);
  } catch {
    /* Attendance / marks / fee tables may be missing until migrations are applied. */
  }

  return { ok: true };
}

async function seedDemoStudentAcademics(
  prisma: PrismaClient,
  sectionId: string,
  semesterNumber: number,
  branchId: string,
  batchId: string
) {
  const subjects = await prisma.subject.findMany({
    where: {
      branchId,
      semesterNumber,
      status: StructureStatus.ACTIVE,
      isArchived: false,
      OR: [{ batchId }, { batchId: null }]
    },
    orderBy: { code: "asc" },
    take: 4
  });
  if (!subjects.length) return;

  for (const subject of subjects) {
    await prisma.sectionSubjectAssignment.upsert({
      where: { sectionId_subjectId: { sectionId, subjectId: subject.id } },
      update: { isActive: true },
      create: { sectionId, subjectId: subject.id, isActive: true }
    });
  }

  const primary = subjects[0]!;
  const existingSyllabus = await prisma.syllabus.findFirst({
    where: { subjectId: primary.id, isArchived: false }
  });
  if (existingSyllabus) return;

  const syllabus = await prisma.syllabus.create({
    data: {
      subjectId: primary.id,
      units: {
        create: [
          {
            unitTitle: "Introduction & foundations",
            unitOrder: 1,
            topics: {
              create: [
                { topicTitle: "Course overview", topicOrder: 1 },
                { topicTitle: "Core concepts", topicOrder: 2 }
              ]
            }
          },
          {
            unitTitle: "Applied topics",
            unitOrder: 2,
            topics: {
              create: [
                { topicTitle: "Case studies", topicOrder: 1 },
                { topicTitle: "Lab practice", topicOrder: 2 }
              ]
            }
          }
        ]
      }
    },
    include: { units: { include: { topics: true } } }
  });

  const firstTopic = syllabus.units[0]?.topics[0];
  if (firstTopic) {
    await prisma.sectionSyllabusTopicCompletion.upsert({
      where: { sectionId_topicId: { sectionId, topicId: firstTopic.id } },
      update: { isCompleted: true },
      create: { sectionId, topicId: firstTopic.id, isCompleted: true }
    });
  }

  const firstUnit = syllabus.units[0];
  if (firstUnit) {
    await prisma.syllabusUnitResource.create({
      data: {
        unitId: firstUnit.id,
        sectionId,
        kind: SyllabusResourceKind.LINK,
        title: "Demo reading list",
        url: "https://example.com/syllabus-demo",
        description: "Sample link uploaded for the student portal."
      }
    });
    await prisma.syllabusUnitResource.create({
      data: {
        unitId: firstUnit.id,
        sectionId,
        kind: SyllabusResourceKind.NOTE,
        title: "Unit 1 summary",
        noteBody: "Review lecture slides before the next class. This note is seeded for demo purposes."
      }
    });
  }
}

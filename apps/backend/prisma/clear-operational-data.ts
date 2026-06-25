/**
 * Clears teachers, students, batches, classes, sections, subjects, and related
 * operational records. Keeps ADMIN users, campuses, departments (programs), and branches.
 *
 * Usage: npm run db:clear-operational -w @college-erp/backend
 */
import { PrismaClient, UserType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function deleteCount(label: string, run: () => Promise<{ count: number }>) {
  const { count } = await run();
  if (count > 0) console.info(`  ${label}: ${count}`);
  return count;
}

async function main() {
  const admins = await prisma.user.findMany({
    where: { type: UserType.ADMIN },
    select: { id: true, email: true }
  });
  const adminIds = admins.map((row) => row.id);
  console.info(`Keeping ${admins.length} admin account(s): ${admins.map((a) => a.email).join(", ") || "(none)"}`);

  await prisma.$transaction(async (tx) => {
    console.info("Clearing portal and engagement data…");
    await deleteCount("FeedbackAnswer", () => tx.feedbackAnswer.deleteMany());
    await deleteCount("FeedbackSubmission", () => tx.feedbackSubmission.deleteMany());
    await deleteCount("FeedbackQuestion", () => tx.feedbackQuestion.deleteMany());
    await deleteCount("StudentPortalNotification", () => tx.studentPortalNotification.deleteMany());
    await deleteCount("AnnouncementRead", () => tx.announcementRead.deleteMany());
    await deleteCount("AnnouncementAttachment", () => tx.announcementAttachment.deleteMany());
    await deleteCount("Announcement", () => tx.announcement.deleteMany());
    await deleteCount("FeedbackForm", () => tx.feedbackForm.deleteMany());

    console.info("Clearing student activity…");
    await deleteCount("StudentTeamMember", () => tx.studentTeamMember.deleteMany());
    await deleteCount("StudentTeam", () => tx.studentTeam.deleteMany());
    await deleteCount("StudentPromotionHistory", () => tx.studentPromotionHistory.deleteMany());
    await deleteCount("StudentApplication", () => tx.studentApplication.deleteMany());
    await deleteCount("ResultEntry", () => tx.resultEntry.deleteMany());
    await deleteCount("FeePayment", () => tx.feePayment.deleteMany());
    await deleteCount("StudentFeeAssignment", () => tx.studentFeeAssignment.deleteMany());
    await deleteCount("FeeStructure", () => tx.feeStructure.deleteMany());
    await deleteCount("FeeHead", () => tx.feeHead.deleteMany());

    console.info("Clearing attendance and timetable…");
    await deleteCount("AttendanceEntry", () => tx.attendanceEntry.deleteMany());
    await deleteCount("AttendanceCorrectionRequest", () => tx.attendanceCorrectionRequest.deleteMany());
    await deleteCount("AttendanceSession", () => tx.attendanceSession.deleteMany());
    await deleteCount("AttendanceHoliday", () => tx.attendanceHoliday.deleteMany());
    await deleteCount("TimetableSlot", () => tx.timetableSlot.deleteMany());

    console.info("Clearing syllabus…");
    await deleteCount("SectionSyllabusTopicCompletion", () => tx.sectionSyllabusTopicCompletion.deleteMany());
    await deleteCount("SyllabusUnitResource", () => tx.syllabusUnitResource.deleteMany());
    await deleteCount("SyllabusTopic", () => tx.syllabusTopic.deleteMany());
    await deleteCount("SyllabusUnit", () => tx.syllabusUnit.deleteMany());
    await deleteCount("Syllabus", () => tx.syllabus.deleteMany());
    await deleteCount("SectionSubjectAssignment", () => tx.sectionSubjectAssignment.deleteMany());
    await deleteCount("TeacherRoleAssignment", () => tx.teacherRoleAssignment.deleteMany());

    console.info("Removing teachers and students…");
    await deleteCount("StudentProfile", () => tx.studentProfile.deleteMany());
    await deleteCount("TeacherProfile", () => tx.teacherProfile.deleteMany());

    if (adminIds.length) {
      await deleteCount("PermissionGrant (non-admin)", () =>
        tx.permissionGrant.deleteMany({ where: { userId: { notIn: adminIds } } })
      );
    } else {
      await deleteCount("PermissionGrant", () => tx.permissionGrant.deleteMany());
    }

    await deleteCount("User (non-admin)", () =>
      tx.user.deleteMany({ where: { type: { not: UserType.ADMIN } } })
    );

    console.info("Clearing academic structure (batches → sections, subjects)…");
    await deleteCount("Subject", () => tx.subject.deleteMany());
    await deleteCount("Section", () => tx.section.deleteMany());
    await deleteCount("AcademicClass", () => tx.academicClass.deleteMany());
    await deleteCount("Batch", () => tx.batch.deleteMany());

    console.info("Clearing jobs and audit…");
    await deleteCount("BackgroundJobRecord", () => tx.backgroundJobRecord.deleteMany());
    await deleteCount("IdempotencyKey", () => tx.idempotencyKey.deleteMany());
    await deleteCount("AuditLog", () => tx.auditLog.deleteMany());
  });

  const remaining = await prisma.user.groupBy({ by: ["type"], _count: { _all: true } });
  console.info("Done. Remaining users:", remaining.map((row) => `${row.type}=${row._count._all}`).join(", ") || "none");
  console.info("Campuses, departments, branches, and admin accounts were kept.");
  console.info("Demo bootstrap is disabled when ERP_DEMO_*_BOOTSTRAP=false in .env — restart backend after wipe.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

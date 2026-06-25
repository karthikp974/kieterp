import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { StructureStatus, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";

export async function resolveStudentSectionSubjects(
  prisma: PrismaService,
  sectionId: string,
  batchId: string,
  branchId: string,
  semesterNumber: number
) {
  const assignments = await prisma.sectionSubjectAssignment.findMany({
    where: {
      sectionId,
      isActive: true,
      subject: { status: StructureStatus.ACTIVE, isArchived: false, semesterNumber }
    },
    orderBy: { subject: { code: "asc" } },
    include: { subject: true }
  });

  let subjects = assignments.map((row) => row.subject);
  if (!subjects.length) {
    subjects = await prisma.subject.findMany({
      where: {
        branchId,
        semesterNumber,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        OR: [{ batchId }, { batchId: null }]
      },
      orderBy: { code: "asc" }
    });
  }

  return subjects;
}

export async function assertStudentSubjectAccess(
  prisma: PrismaService,
  user: AuthUser,
  subjectId: string,
  semesterNumber?: number
): Promise<{ sectionId: string; semesterNumber: number }> {
  if (user.type !== UserType.STUDENT) {
    throw new ForbiddenException("Only student accounts can access subjects.");
  }
  const student = await loadStudentPortalProfile(prisma, user.id);
  const cls = student.section.class;
  const currentSemesterNumber = cls.semesterNumber;
  const selectedSemesterNumber = semesterNumber ?? currentSemesterNumber;

  if (selectedSemesterNumber > currentSemesterNumber) {
    throw new BadRequestException("Cannot view subjects for a future semester.");
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, status: StructureStatus.ACTIVE, isArchived: false }
  });
  if (!subject || subject.semesterNumber !== selectedSemesterNumber) {
    throw new NotFoundException("Subject is not part of your schedule for this semester.");
  }

  const subjects = await resolveStudentSectionSubjects(
    prisma,
    student.sectionId,
    cls.batchId,
    cls.batch.branchId,
    selectedSemesterNumber
  );
  if (!subjects.some((row) => row.id === subjectId)) {
    throw new NotFoundException("Subject is not part of your section schedule.");
  }

  return { sectionId: student.sectionId, semesterNumber: selectedSemesterNumber };
}

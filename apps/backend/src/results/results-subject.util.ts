import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus } from "@prisma/client";

type SubjectRecord = {
  id: string;
  branchId: string;
  semesterNumber: number;
  code: string;
  name: string;
};

type ResultSubjectDb = {
  subject: {
    findFirst: (args: Prisma.SubjectFindFirstArgs) => Promise<SubjectRecord | null>;
  };
};

function normalizeResultSubjectCode(value: string) {
  return value.trim().toUpperCase();
}

/** Match JNTUK subcode against the student's current or immediately previous semester only. */
export async function resolveResultSubjectByCodeForSemesters(
  db: ResultSubjectDb,
  input: { branchId: string; subjectCode: string; semesterNumbers: number[] }
): Promise<SubjectRecord | null> {
  const code = normalizeResultSubjectCode(input.subjectCode);
  const semesters = [...new Set(input.semesterNumbers.filter((n) => Number.isFinite(n) && n >= 1))];
  if (!code || !semesters.length) return null;

  return db.subject.findFirst({
    where: {
      code: { equals: code, mode: "insensitive" },
      branchId: input.branchId,
      semesterNumber: { in: semesters },
      status: StructureStatus.ACTIVE,
      isArchived: false
    },
    orderBy: { semesterNumber: "desc" }
  });
}

/** Resolve catalog subject by code — semester comes from the subject record, not the student. */
export async function resolveResultSubjectByCode(
  db: ResultSubjectDb,
  input: { branchId: string; subjectCode: string }
): Promise<SubjectRecord> {
  const code = normalizeResultSubjectCode(input.subjectCode);
  if (!code) {
    throw new BadRequestException("Subject code is required.");
  }

  const subject = await db.subject.findFirst({
    where: {
      code: { equals: code, mode: "insensitive" },
      status: StructureStatus.ACTIVE,
      isArchived: false
    }
  });

  if (!subject) {
    throw new NotFoundException(
      `Subject code "${code}" is not in the catalog. Create the subject with this code before importing results.`
    );
  }

  if (subject.branchId !== input.branchId) {
    throw new BadRequestException(
      `Subject code "${code}" belongs to another branch and cannot be used for this student.`
    );
  }

  return subject;
}

/** @deprecated Prefer resolveResultSubjectByCode — semester is derived from subject code. */
export function pickSubjectForBranch(
  subjects: { id: string; branchId: string; semesterNumber: number }[],
  branchId: string,
  preferredSemester: number
) {
  const branchSubjects = subjects.filter((subject) => subject.branchId === branchId);
  if (!branchSubjects.length) return undefined;
  return (
    branchSubjects.find((subject) => subject.semesterNumber === preferredSemester) ??
    branchSubjects.sort((a, b) => Math.abs(a.semesterNumber - preferredSemester) - Math.abs(b.semesterNumber - preferredSemester))[0]
  );
}

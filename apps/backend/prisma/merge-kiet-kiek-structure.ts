import { PrismaClient, ProgramStructureScope, StructureStatus } from "@prisma/client";
import {
  CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE,
  isSharedGroupProgramCode
} from "../src/permissions/shared-group-academic.constants";

type SectionPath = {
  programCode: string;
  branchCode: string;
  batchStart: number;
  batchEnd: number;
  semester: number;
  sectionName: string;
};

/**
 * One-time merge: move KIEK students onto the canonical KIET shared tree and archive duplicate KIEK structure.
 * Safe to run repeatedly — skips when KIEK has no shared-program rows.
 */
export async function mergeKietKiekDuplicateStructure(prisma: PrismaClient): Promise<{ mergedStudents: number; archivedPrograms: number }> {
  const kiet = await prisma.campus.findUnique({ where: { code: CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE } });
  const kiek = await prisma.campus.findUnique({ where: { code: "KIEK" } });
  if (!kiet || !kiek) {
    return { mergedStudents: 0, archivedPrograms: 0 };
  }

  const kiekSharedPrograms = await prisma.program.findMany({
    where: {
      campusId: kiek.id,
      code: { in: ["DIPLOMA", "BTECH", "MTECH"] },
      status: StructureStatus.ACTIVE
    }
  });
  if (kiekSharedPrograms.length === 0) {
    return { mergedStudents: 0, archivedPrograms: 0 };
  }

  const canonicalPrograms = await prisma.program.findMany({
    where: { campusId: kiet.id, structureScope: ProgramStructureScope.GROUP_SHARED }
  });
  const canonicalByCode = new Map(canonicalPrograms.map((p) => [p.code, p]));

  let mergedStudents = 0;

  for (const kiekProgram of kiekSharedPrograms) {
    const canonicalProgram = canonicalByCode.get(kiekProgram.code);
    if (!canonicalProgram) continue;

    const kiekBranches = await prisma.branch.findMany({ where: { programId: kiekProgram.id, status: StructureStatus.ACTIVE } });
    for (const kiekBranch of kiekBranches) {
      const canonicalBranch = await prisma.branch.findFirst({
        where: { programId: canonicalProgram.id, code: kiekBranch.code, status: StructureStatus.ACTIVE }
      });
      if (!canonicalBranch) continue;

      const kiekBatches = await prisma.batch.findMany({ where: { branchId: kiekBranch.id, status: StructureStatus.ACTIVE } });
      for (const kiekBatch of kiekBatches) {
        const canonicalBatch = await prisma.batch.findFirst({
          where: {
            branchId: canonicalBranch.id,
            startYear: kiekBatch.startYear,
            endYear: kiekBatch.endYear,
            status: StructureStatus.ACTIVE
          }
        });
        if (!canonicalBatch) continue;

        const kiekClasses = await prisma.academicClass.findMany({ where: { batchId: kiekBatch.id, status: StructureStatus.ACTIVE } });
        for (const kiekClass of kiekClasses) {
          const canonicalClass = await prisma.academicClass.findFirst({
            where: {
              batchId: canonicalBatch.id,
              semesterNumber: kiekClass.semesterNumber,
              status: StructureStatus.ACTIVE
            }
          });
          if (!canonicalClass) continue;

          const kiekSections = await prisma.section.findMany({ where: { classId: kiekClass.id, status: StructureStatus.ACTIVE } });
          for (const kiekSection of kiekSections) {
            const canonicalSection = await prisma.section.findFirst({
              where: { classId: canonicalClass.id, name: kiekSection.name, status: StructureStatus.ACTIVE }
            });
            if (!canonicalSection) continue;

            const result = await prisma.studentProfile.updateMany({
              where: { sectionId: kiekSection.id, isArchived: false },
              data: { sectionId: canonicalSection.id }
            });
            mergedStudents += result.count;
          }
        }
      }
    }
  }

  const archivedAt = new Date();
  let archivedPrograms = 0;
  for (const program of kiekSharedPrograms) {
    await prisma.$transaction(async (tx) => {
      const branches = await tx.branch.findMany({ where: { programId: program.id } });
      for (const branch of branches) {
        const batches = await tx.batch.findMany({ where: { branchId: branch.id } });
        for (const batch of batches) {
          const classes = await tx.academicClass.findMany({ where: { batchId: batch.id } });
          for (const cls of classes) {
            await tx.section.updateMany({
              where: { classId: cls.id },
              data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
            });
          }
          await tx.academicClass.updateMany({
            where: { batchId: batch.id },
            data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
          });
        }
        await tx.batch.updateMany({
          where: { branchId: branch.id },
          data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
        });
      }
      await tx.branch.updateMany({
        where: { programId: program.id },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
      });
      await tx.program.update({
        where: { id: program.id },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
      });
    });
    archivedPrograms += 1;
  }

  return { mergedStudents, archivedPrograms };
}

export function resolveProgramStructureScope(
  campusCode: string,
  programCode: string,
  groupPolicy: "SHARED" | "ISOLATED"
): ProgramStructureScope {
  if (groupPolicy === "SHARED" && campusCode === CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE && isSharedGroupProgramCode(programCode)) {
    return ProgramStructureScope.GROUP_SHARED;
  }
  return ProgramStructureScope.CAMPUS_OWNED;
}

export function sectionPathKey(path: SectionPath): string {
  return `${path.programCode}|${path.branchCode}|${path.batchStart}|${path.batchEnd}|${path.semester}|${path.sectionName}`;
}

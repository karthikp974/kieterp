import { PrismaClient, StructureStatus } from "@prisma/client";
import { istYear } from "../common/ist-time.util";
import { formatSemesterLabel } from "../common/semester-label.util";

export type DemoAcademicScope = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
};

/**
 * Ensures minimal KIET / BTECH / CSC academic structure for demo teachers and students.
 */
export async function ensureDemoAcademicStructure(prisma: PrismaClient): Promise<DemoAcademicScope | null> {
  const campus = await prisma.campus.findUnique({ where: { code: "KIET" } });
  const program = campus
    ? await prisma.program.findFirst({
        where: { campusId: campus.id, code: "BTECH", status: StructureStatus.ACTIVE }
      })
    : null;
  const branch = program
    ? await prisma.branch.findFirst({
        where: { programId: program.id, code: "CSC", status: StructureStatus.ACTIVE }
      })
    : null;
  if (!campus || !program || !branch) {
    return null;
  }

  const startYear = istYear(new Date()) - 1;
  const endYear = startYear + program.durationValue;
  const batchCode = `DEMO-${startYear}`;
  const batch = await prisma.batch.upsert({
    where: { branchId_startYear_endYear: { branchId: branch.id, startYear, endYear } },
    update: { status: StructureStatus.ACTIVE, isArchived: false, archivedAt: null, batchCode },
    create: {
      branchId: branch.id,
      batchCode,
      startYear,
      endYear,
      status: StructureStatus.ACTIVE
    }
  });

  const semesterNumber = 3;
  const classLabel = formatSemesterLabel(semesterNumber);
  const academicClass = await prisma.academicClass.upsert({
    where: { batchId_semesterNumber: { batchId: batch.id, semesterNumber } },
    update: {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      archivedAt: null,
      label: classLabel,
      yearNumber: 2
    },
    create: {
      branchId: branch.id,
      batchId: batch.id,
      label: classLabel,
      yearNumber: 2,
      semesterNumber,
      status: StructureStatus.ACTIVE
    }
  });

  const section = await prisma.section.upsert({
    where: { classId_name: { classId: academicClass.id, name: "A" } },
    update: { status: StructureStatus.ACTIVE, isArchived: false, archivedAt: null, campusId: campus.id },
    create: {
      campusId: campus.id,
      classId: academicClass.id,
      name: "A",
      status: StructureStatus.ACTIVE
    }
  });

  let subject = await prisma.subject.findFirst({
    where: { branchId: branch.id, code: "DEMO-SUB", status: StructureStatus.ACTIVE }
  });
  if (!subject) {
    subject = await prisma.subject.create({
      data: {
        branchId: branch.id,
        code: "DEMO-SUB",
        name: "Demo Subject",
        semesterNumber,
        status: StructureStatus.ACTIVE
      }
    });
  }

  const demoSubjectCodes = [
    { code: "ML", name: "Machine Learning" },
    { code: "DL", name: "Deep Learning" },
    { code: "NLP", name: "NLP" },
    { code: "ML-LAB", name: "ML Lab" }
  ] as const;
  for (const def of demoSubjectCodes) {
    const catalogSubject = await prisma.subject.upsert({
      where: { code: def.code },
      update: {
        branchId: branch.id,
        name: def.name,
        semesterNumber,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        archivedAt: null
      },
      create: {
        branchId: branch.id,
        code: def.code,
        name: def.name,
        semesterNumber,
        status: StructureStatus.ACTIVE
      }
    });
    await prisma.sectionSubjectAssignment.upsert({
      where: { sectionId_subjectId: { sectionId: section.id, subjectId: catalogSubject.id } },
      update: { isActive: true },
      create: { sectionId: section.id, subjectId: catalogSubject.id, isActive: true }
    });
  }

  await prisma.sectionSubjectAssignment.upsert({
    where: { sectionId_subjectId: { sectionId: section.id, subjectId: subject.id } },
    update: { isActive: true },
    create: { sectionId: section.id, subjectId: subject.id, isActive: true }
  });

  return {
    campusId: campus.id,
    programId: program.id,
    branchId: branch.id,
    batchId: batch.id,
    classId: academicClass.id,
    sectionId: section.id,
    subjectId: subject.id
  };
}

import {
  AttendanceEntryStatus,
  FeePaymentMode,
  FeePaymentStatus,
  PrismaClient,
  ResultEntryStatus,
  StructureStatus,
  StudentFeePaymentStatus,
  UserStatus,
  UserType
} from "@prisma/client";
import { formatIstDate, istDaysAgoDate, istStartOfDay } from "../common/ist-time.util";
import { attendanceDayPeriod } from "../common/attendance.constants";
import { formatSemesterLabel } from "../common/semester-label.util";
import { ensureDemoAcademicStructure } from "./demo-academic-structure";
import { DEMO_STUDENT_ROLL } from "./student-demo";

/** Demo student is in linear semester 3 → display label 2.1. */
export const DEMO_STUDENT_SEMESTER = 3;

const DEMO_ATTENDANCE_PREFIX = "DEMO-SP|";

type DemoScope = NonNullable<Awaited<ReturnType<typeof ensureDemoAcademicStructure>>>;

function weekdayDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(cursor));
    cursor.setTime(cursor.getTime() + 86400000);
  }
  return dates;
}

function pickDates(count: number, startDaysAgo: number, endDaysAgo: number): Date[] {
  const end = istDaysAgoDate(endDaysAgo);
  const start = istDaysAgoDate(startDaysAgo);
  const pool = weekdayDatesBetween(start, end);
  if (pool.length <= count) return pool;
  const step = Math.max(1, Math.floor(pool.length / count));
  const picked: Date[] = [];
  for (let i = 0; i < pool.length && picked.length < count; i += step) {
    picked.push(pool[i]!);
  }
  return picked;
}

async function ensureBatchClass(
  prisma: PrismaClient,
  batchId: string,
  branchId: string,
  semesterNumber: number
) {
  const yearNumber = Math.ceil(semesterNumber / 2);
  const label = formatSemesterLabel(semesterNumber);
  return prisma.academicClass.upsert({
    where: { batchId_semesterNumber: { batchId, semesterNumber } },
    update: { label, yearNumber, status: StructureStatus.ACTIVE, isArchived: false, archivedAt: null },
    create: {
      branchId,
      batchId,
      label,
      yearNumber,
      semesterNumber,
      status: StructureStatus.ACTIVE
    }
  });
}

async function ensureSemesterSubject(
  prisma: PrismaClient,
  branchId: string,
  semesterNumber: number,
  code: string,
  name: string
) {
  return prisma.subject.upsert({
    where: { code },
    update: {
      branchId,
      name,
      semesterNumber,
      status: StructureStatus.ACTIVE,
      isArchived: false,
      archivedAt: null
    },
    create: {
      branchId,
      code,
      name,
      semesterNumber,
      status: StructureStatus.ACTIVE
    }
  });
}

async function seedAttendanceForSemester(
  prisma: PrismaClient,
  input: {
    scope: DemoScope;
    studentProfileId: string;
    markedById: string;
    classId: string;
    subjectId: string;
    semesterNumber: number;
    startDaysAgo: number;
    endDaysAgo: number;
    sessionCount: number;
    presentRatio: number;
  }
) {
  const dates = pickDates(input.sessionCount, input.startDaysAgo, input.endDaysAgo);
  let created = 0;

  for (const date of dates) {
    const dateKey = formatIstDate(date);
    const sessionKey = `${DEMO_ATTENDANCE_PREFIX}${input.scope.sectionId}|${input.classId}|${dateKey}|${input.semesterNumber}`;
    const present = Math.random() < input.presentRatio;
    const existing = await prisma.attendanceSession.findUnique({ where: { sessionKey } });
    if (existing) {
      await prisma.attendanceEntry.upsert({
        where: { sessionId_studentProfileId: { sessionId: existing.id, studentProfileId: input.studentProfileId } },
        update: { status: present ? AttendanceEntryStatus.PRESENT : AttendanceEntryStatus.ABSENT },
        create: {
          sessionId: existing.id,
          studentProfileId: input.studentProfileId,
          status: present ? AttendanceEntryStatus.PRESENT : AttendanceEntryStatus.ABSENT
        }
      });
      continue;
    }

    await prisma.attendanceSession.create({
      data: {
        sessionKey,
        campusId: input.scope.campusId,
        programId: input.scope.programId,
        branchId: input.scope.branchId,
        batchId: input.scope.batchId,
        classId: input.classId,
        sectionId: input.scope.sectionId,
        subjectId: input.subjectId,
        markedById: input.markedById,
        attendanceDate: istStartOfDay(
          Number(dateKey.slice(0, 4)),
          Number(dateKey.slice(5, 7)),
          Number(dateKey.slice(8, 10))
        ),
        periodLabel: attendanceDayPeriod(),
        entries: {
          create: {
            studentProfileId: input.studentProfileId,
            status: present ? AttendanceEntryStatus.PRESENT : AttendanceEntryStatus.ABSENT
          }
        }
      }
    });
    created += 1;
  }

  return created;
}

async function seedResults(
  prisma: PrismaClient,
  input: {
    studentProfileId: string;
    createdById: string;
    branchId: string;
    semesterNumber: number;
    subjectCode: string;
    subjectName: string;
    grade: string;
    internals: number;
    externals: number;
    credits?: number;
    status?: ResultEntryStatus;
  }
) {
  const subject = await ensureSemesterSubject(
    prisma,
    input.branchId,
    input.semesterNumber,
    input.subjectCode,
    input.subjectName
  );
  const total = input.internals + input.externals;
  const credits = input.credits ?? 3;
  const status = input.status ?? ResultEntryStatus.PASS;
  await prisma.resultEntry.upsert({
    where: {
      studentProfileId_subjectId_examType: {
        studentProfileId: input.studentProfileId,
        subjectId: subject.id,
        examType: "SEMESTER"
      }
    },
    update: {
      semesterNumber: input.semesterNumber,
      internals: input.internals,
      externals: input.externals,
      totalMarks: total,
      grade: input.grade,
      credits,
      status,
      isPublished: true
    },
    create: {
      studentProfileId: input.studentProfileId,
      subjectId: subject.id,
      semesterNumber: input.semesterNumber,
      examType: "SEMESTER",
      internals: input.internals,
      externals: input.externals,
      totalMarks: total,
      grade: input.grade,
      credits,
      status,
      isPublished: true,
      createdById: input.createdById
    }
  });
}

async function seedSemesterResults(
  prisma: PrismaClient,
  input: {
    studentProfileId: string;
    createdById: string;
    branchId: string;
    semesterNumber: number;
    subjects: {
      subjectCode: string;
      subjectName: string;
      grade: string;
      internals: number;
      externals: number;
      credits?: number;
      status?: ResultEntryStatus;
    }[];
  }
) {
  for (const subject of input.subjects) {
    await seedResults(prisma, {
      studentProfileId: input.studentProfileId,
      createdById: input.createdById,
      branchId: input.branchId,
      semesterNumber: input.semesterNumber,
      ...subject
    });
  }
}

async function seedSemesterFeePair(
  prisma: PrismaClient,
  input: {
    scope: DemoScope;
    studentProfileId: string;
    receivedById: string;
    classId: string;
    semesterNumber: number;
    tuitionHeadId: string;
    examHeadId: string;
    tuitionAmount: number;
    examAmount: number;
    tuitionStatus: StudentFeePaymentStatus;
    examStatus: StudentFeePaymentStatus;
    tuitionPaid?: number;
    examPaid?: number;
    tuitionReceiptNo?: string;
    examReceiptNo?: string;
    examTransactionId?: string;
    tuitionNote?: string;
    examPaidAtDaysAgo?: number;
    tuitionPaidAtDaysAgo?: number;
    structureKey: string;
  }
) {
  const semLabel = formatSemesterLabel(input.semesterNumber);
  const tuitionStructure = await prisma.feeStructure.upsert({
    where: { id: `demo-sp-tuition-${input.structureKey}` },
    update: {
      feeHeadId: input.tuitionHeadId,
      campusId: input.scope.campusId,
      programId: input.scope.programId,
      branchId: input.scope.branchId,
      batchId: input.scope.batchId,
      classId: input.classId,
      feeHeadName: `${semLabel} tuition`,
      amount: input.tuitionAmount,
      isActive: true,
      isArchived: false
    },
    create: {
      id: `demo-sp-tuition-${input.structureKey}`,
      feeHeadId: input.tuitionHeadId,
      campusId: input.scope.campusId,
      programId: input.scope.programId,
      branchId: input.scope.branchId,
      batchId: input.scope.batchId,
      classId: input.classId,
      feeHeadName: `${semLabel} tuition`,
      amount: input.tuitionAmount,
      createdById: input.receivedById,
      isActive: true
    }
  });

  const examStructure = await prisma.feeStructure.upsert({
    where: { id: `demo-sp-exam-${input.structureKey}` },
    update: {
      feeHeadId: input.examHeadId,
      campusId: input.scope.campusId,
      programId: input.scope.programId,
      branchId: input.scope.branchId,
      batchId: input.scope.batchId,
      classId: input.classId,
      feeHeadName: `${semLabel} semester exam fee`,
      amount: input.examAmount,
      isActive: true,
      isArchived: false
    },
    create: {
      id: `demo-sp-exam-${input.structureKey}`,
      feeHeadId: input.examHeadId,
      campusId: input.scope.campusId,
      programId: input.scope.programId,
      branchId: input.scope.branchId,
      batchId: input.scope.batchId,
      classId: input.classId,
      feeHeadName: `${semLabel} semester exam fee`,
      amount: input.examAmount,
      createdById: input.receivedById,
      isActive: true
    }
  });

  const tuitionAssignment = await prisma.studentFeeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: input.studentProfileId, feeStructureId: tuitionStructure.id } },
    update: { paymentStatus: input.tuitionStatus },
    create: {
      studentId: input.studentProfileId,
      feeStructureId: tuitionStructure.id,
      paymentStatus: input.tuitionStatus
    }
  });

  const examAssignment = await prisma.studentFeeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: input.studentProfileId, feeStructureId: examStructure.id } },
    update: { paymentStatus: input.examStatus },
    create: {
      studentId: input.studentProfileId,
      feeStructureId: examStructure.id,
      paymentStatus: input.examStatus
    }
  });

  if (input.tuitionPaid && input.tuitionReceiptNo) {
    await prisma.feePayment.upsert({
      where: { receiptNo: input.tuitionReceiptNo },
      update: {
        amount: input.tuitionPaid,
        status: FeePaymentStatus.ACTIVE,
        paidAt: istDaysAgoDate(input.tuitionPaidAtDaysAgo ?? 45),
        note: input.tuitionNote ?? null
      },
      create: {
        receiptNo: input.tuitionReceiptNo,
        transactionId: `TXN-TUITION-${input.structureKey}`,
        studentProfileId: input.studentProfileId,
        studentFeeAssignmentId: tuitionAssignment.id,
        feeHeadId: input.tuitionHeadId,
        amount: input.tuitionPaid,
        paymentMode: FeePaymentMode.CASH,
        paidAt: istDaysAgoDate(input.tuitionPaidAtDaysAgo ?? 45),
        receivedById: input.receivedById,
        status: FeePaymentStatus.ACTIVE,
        note: input.tuitionNote ?? null
      }
    });
  }

  if (input.examPaid && input.examReceiptNo) {
    await prisma.feePayment.upsert({
      where: { receiptNo: input.examReceiptNo },
      update: {
        amount: input.examPaid,
        status: FeePaymentStatus.ACTIVE,
        paidAt: istDaysAgoDate(input.examPaidAtDaysAgo ?? 12),
        transactionId: input.examTransactionId ?? `TXN-EXAM-${input.structureKey}`
      },
      create: {
        receiptNo: input.examReceiptNo,
        transactionId: input.examTransactionId ?? `TXN-EXAM-${input.structureKey}`,
        studentProfileId: input.studentProfileId,
        studentFeeAssignmentId: examAssignment.id,
        feeHeadId: input.examHeadId,
        amount: input.examPaid,
        paymentMode: FeePaymentMode.UPI,
        paidAt: istDaysAgoDate(input.examPaidAtDaysAgo ?? 12),
        receivedById: input.receivedById,
        status: FeePaymentStatus.ACTIVE
      }
    });
  }
}

async function seedFees(
  prisma: PrismaClient,
  input: {
    scope: DemoScope;
    studentProfileId: string;
    receivedById: string;
    classSem1Id: string;
    classSem2Id: string;
    classSem3Id: string;
  }
) {
  const tuitionHead = await prisma.feeHead.upsert({
    where: { code: "DEMO-TUITION" },
    update: { name: "Tuition Fee", isActive: true },
    create: { code: "DEMO-TUITION", name: "Tuition Fee", description: "Demo tuition for student portal" }
  });
  const examHead = await prisma.feeHead.upsert({
    where: { code: "DEMO-EXAM" },
    update: { name: "Examination Fee", isActive: true },
    create: { code: "DEMO-EXAM", name: "Examination Fee", description: "Demo exam fee for student portal" }
  });

  await seedSemesterFeePair(prisma, {
    scope: input.scope,
    studentProfileId: input.studentProfileId,
    receivedById: input.receivedById,
    classId: input.classSem1Id,
    semesterNumber: 1,
    tuitionHeadId: tuitionHead.id,
    examHeadId: examHead.id,
    tuitionAmount: 72000,
    examAmount: 4000,
    tuitionStatus: StudentFeePaymentStatus.PAID,
    examStatus: StudentFeePaymentStatus.PAID,
    tuitionPaid: 72000,
    examPaid: 4000,
    tuitionReceiptNo: "KIET/2026/RCP/000010",
    examReceiptNo: "KIET/2026/RCP/000011",
    examTransactionId: "412345678902",
    tuitionPaidAtDaysAgo: 420,
    examPaidAtDaysAgo: 400,
    structureKey: "sem1"
  });

  await seedSemesterFeePair(prisma, {
    scope: input.scope,
    studentProfileId: input.studentProfileId,
    receivedById: input.receivedById,
    classId: input.classSem2Id,
    semesterNumber: 2,
    tuitionHeadId: tuitionHead.id,
    examHeadId: examHead.id,
    tuitionAmount: 78000,
    examAmount: 4200,
    tuitionStatus: StudentFeePaymentStatus.PAID,
    examStatus: StudentFeePaymentStatus.UNPAID,
    tuitionPaid: 78000,
    tuitionReceiptNo: "KIET/2026/RCP/000012",
    tuitionPaidAtDaysAgo: 280,
    structureKey: "sem2"
  });

  await seedSemesterFeePair(prisma, {
    scope: input.scope,
    studentProfileId: input.studentProfileId,
    receivedById: input.receivedById,
    classId: input.classSem3Id,
    semesterNumber: DEMO_STUDENT_SEMESTER,
    tuitionHeadId: tuitionHead.id,
    examHeadId: examHead.id,
    tuitionAmount: 85000,
    examAmount: 4500,
    tuitionStatus: StudentFeePaymentStatus.PARTIAL,
    examStatus: StudentFeePaymentStatus.PAID,
    tuitionPaid: 50000,
    examPaid: 4500,
    tuitionReceiptNo: "KIET/2026/RCP/000002",
    examReceiptNo: "KIET/2026/RCP/000001",
    examTransactionId: "412345678901",
    tuitionNote: "Partial tuition — semester 2.1",
    tuitionPaidAtDaysAgo: 45,
    examPaidAtDaysAgo: 12,
    structureKey: "sem3"
  });
}

export async function ensureDemoStudentPortalData(prisma: PrismaClient) {
  const scope = await ensureDemoAcademicStructure(prisma);
  if (!scope) {
    return { ok: false as const, reason: "Demo academic structure missing." };
  }

  const student = await prisma.studentProfile.findFirst({
    where: { rollNumber: DEMO_STUDENT_ROLL, isArchived: false },
    select: { id: true }
  });
  if (!student) {
    return { ok: false as const, reason: "Demo student profile missing." };
  }

  const markedBy =
    (await prisma.user.findFirst({
      where: { type: UserType.ADMIN, status: UserStatus.ACTIVE },
      select: { id: true }
    })) ??
    (await prisma.user.findFirst({
      where: { type: UserType.TEACHER, status: UserStatus.ACTIVE },
      select: { id: true }
    }));
  if (!markedBy) {
    return { ok: false as const, reason: "No admin/teacher user to mark demo attendance." };
  }

  const classSem1 = await ensureBatchClass(prisma, scope.batchId, scope.branchId, 1);
  const classSem2 = await ensureBatchClass(prisma, scope.batchId, scope.branchId, 2);
  const classSem3 = await ensureBatchClass(prisma, scope.batchId, scope.branchId, DEMO_STUDENT_SEMESTER);

  await prisma.section.update({
    where: { id: scope.sectionId },
    data: { classId: classSem3.id }
  });

  const subjectSem1 = await ensureSemesterSubject(prisma, scope.branchId, 1, "DEMO-S1-CORE", "Engineering Mathematics I");
  const subjectSem2 = await ensureSemesterSubject(prisma, scope.branchId, 2, "DEMO-S2-CORE", "Data Structures");
  const subjectSem3 = await prisma.subject.findFirst({
    where: { branchId: scope.branchId, code: "ML", status: StructureStatus.ACTIVE },
    select: { id: true }
  });
  const currentSubjectId = subjectSem3?.id ?? scope.subjectId;

  let created = 0;
  created += await seedAttendanceForSemester(prisma, {
    scope,
    studentProfileId: student.id,
    markedById: markedBy.id,
    classId: classSem1.id,
    subjectId: subjectSem1.id,
    semesterNumber: 1,
    startDaysAgo: 540,
    endDaysAgo: 420,
    sessionCount: 18,
    presentRatio: 0.88
  });
  created += await seedAttendanceForSemester(prisma, {
    scope,
    studentProfileId: student.id,
    markedById: markedBy.id,
    classId: classSem2.id,
    subjectId: subjectSem2.id,
    semesterNumber: 2,
    startDaysAgo: 400,
    endDaysAgo: 280,
    sessionCount: 20,
    presentRatio: 0.82
  });
  created += await seedAttendanceForSemester(prisma, {
    scope,
    studentProfileId: student.id,
    markedById: markedBy.id,
    classId: classSem3.id,
    subjectId: currentSubjectId,
    semesterNumber: DEMO_STUDENT_SEMESTER,
    startDaysAgo: 120,
    endDaysAgo: 0,
    sessionCount: 24,
    presentRatio: 0.9
  });

  await seedSemesterResults(prisma, {
    studentProfileId: student.id,
    createdById: markedBy.id,
    branchId: scope.branchId,
    semesterNumber: 1,
    subjects: [
      { subjectCode: "DEMO-S1-CORE", subjectName: "Engineering Mathematics I", grade: "A", internals: 42, externals: 51 },
      { subjectCode: "DEMO-S1-PHY", subjectName: "Engineering Physics", grade: "B+", internals: 39, externals: 48 },
      { subjectCode: "DEMO-S1-CHE", subjectName: "Engineering Chemistry", grade: "A", internals: 41, externals: 50 },
      { subjectCode: "DEMO-S1-EG", subjectName: "Engineering Graphics", grade: "B", internals: 36, externals: 44 },
      { subjectCode: "DEMO-S1-CP", subjectName: "Programming for Problem Solving", grade: "A", internals: 43, externals: 52 }
    ]
  });
  await seedSemesterResults(prisma, {
    studentProfileId: student.id,
    createdById: markedBy.id,
    branchId: scope.branchId,
    semesterNumber: 2,
    subjects: [
      { subjectCode: "DEMO-S2-CORE", subjectName: "Data Structures", grade: "B+", internals: 38, externals: 47 },
      { subjectCode: "DEMO-S2-DBMS", subjectName: "Database Management Systems", grade: "A", internals: 40, externals: 49 },
      { subjectCode: "DEMO-S2-OS", subjectName: "Operating Systems", grade: "B", internals: 35, externals: 43 }
    ]
  });
  await seedSemesterResults(prisma, {
    studentProfileId: student.id,
    createdById: markedBy.id,
    branchId: scope.branchId,
    semesterNumber: DEMO_STUDENT_SEMESTER,
    subjects: [
      { subjectCode: "ML", subjectName: "Machine Learning", grade: "A", internals: 40, externals: 49 },
      { subjectCode: "DL", subjectName: "Deep Learning", grade: "A", internals: 41, externals: 48 },
      { subjectCode: "NLP", subjectName: "NLP", grade: "B+", internals: 37, externals: 46 },
      { subjectCode: "ML-LAB", subjectName: "ML Lab", grade: "A", internals: 45, externals: 47, credits: 2 },
      { subjectCode: "DEMO-S3-CV", subjectName: "Computer Vision", grade: "B+", internals: 38, externals: 45 },
      { subjectCode: "DEMO-S3-STAT", subjectName: "Probability and Statistics", grade: "A", internals: 39, externals: 50 }
    ]
  });

  await seedFees(prisma, {
    scope: { ...scope, classId: classSem3.id },
    studentProfileId: student.id,
    receivedById: markedBy.id,
    classSem1Id: classSem1.id,
    classSem2Id: classSem2.id,
    classSem3Id: classSem3.id
  });

  return { ok: true as const, created };
}

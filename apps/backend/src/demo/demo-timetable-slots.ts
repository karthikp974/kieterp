import { PrismaClient, StructureStatus, TeacherRoleKind, TimetableSlotType, UserStatus, UserType } from "@prisma/client";
import { ensureDemoAcademicStructure } from "./demo-academic-structure";

type SlotSeed = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  room: string;
  slotType: TimetableSlotType;
};

const DEMO_SLOTS: SlotSeed[] = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", subjectCode: "ML", room: "AI301", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 1, startTime: "11:00", endTime: "12:00", subjectCode: "NLP", room: "AI303", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 2, startTime: "10:00", endTime: "11:00", subjectCode: "DL", room: "AI302", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 2, startTime: "14:00", endTime: "15:00", subjectCode: "ML-LAB", room: "AI304", slotType: TimetableSlotType.LAB },
  { dayOfWeek: 3, startTime: "09:00", endTime: "10:00", subjectCode: "ML", room: "AI301", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 3, startTime: "11:00", endTime: "12:00", subjectCode: "NLP", room: "AI303", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 4, startTime: "10:00", endTime: "11:00", subjectCode: "DL", room: "AI302", slotType: TimetableSlotType.LECTURE },
  { dayOfWeek: 4, startTime: "14:00", endTime: "15:00", subjectCode: "ML-LAB", room: "AI304", slotType: TimetableSlotType.LAB },
  { dayOfWeek: 5, startTime: "09:00", endTime: "10:00", subjectCode: "ML", room: "AI301", slotType: TimetableSlotType.LECTURE }
];

const SUBJECT_DEFS = [
  { code: "ML", name: "Machine Learning" },
  { code: "DL", name: "Deep Learning" },
  { code: "NLP", name: "NLP" },
  { code: "ML-LAB", name: "ML Lab" }
] as const;

export async function ensureDemoTimetableSlots(prisma: PrismaClient) {
  const scope = await ensureDemoAcademicStructure(prisma);
  if (!scope) return { ok: false as const, reason: "Demo academic structure missing." };

  const admin = await prisma.user.findFirst({
    where: { type: UserType.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true }
  });
  if (!admin) return { ok: false as const, reason: "Admin user missing for timetable seed." };

  const subjectByCode = new Map<string, string>();
  for (const def of SUBJECT_DEFS) {
    const subject = await prisma.subject.upsert({
      where: { code: def.code },
      update: {
        branchId: scope.branchId,
        name: def.name,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        archivedAt: null,
        semesterNumber: 3
      },
      create: {
        branchId: scope.branchId,
        code: def.code,
        name: def.name,
        semesterNumber: 3,
        status: StructureStatus.ACTIVE
      }
    });
    subjectByCode.set(def.code, subject.id);
    await prisma.sectionSubjectAssignment.upsert({
      where: { sectionId_subjectId: { sectionId: scope.sectionId, subjectId: subject.id } },
      update: { isActive: true },
      create: { sectionId: scope.sectionId, subjectId: subject.id, isActive: true }
    });
  }

  let created = 0;
  for (const slot of DEMO_SLOTS) {
    const subjectId = subjectByCode.get(slot.subjectCode);
    if (!subjectId) continue;
    await prisma.timetableSlot.upsert({
      where: {
        sectionId_dayOfWeek_startTime_endTime: {
          sectionId: scope.sectionId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime
        }
      },
      update: {
        subjectId,
        room: slot.room,
        slotType: slot.slotType,
        status: "ACTIVE"
      },
      create: {
        campusId: scope.campusId,
        programId: scope.programId,
        branchId: scope.branchId,
        batchId: scope.batchId,
        classId: scope.classId,
        sectionId: scope.sectionId,
        subjectId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
        slotType: slot.slotType,
        createdById: admin.id
      }
    });
    created += 1;
  }

  await ensureDemoStpoAssignments(prisma, scope, subjectByCode);

  return { ok: true as const, created };
}

async function ensureDemoStpoAssignments(
  prisma: PrismaClient,
  scope: Awaited<ReturnType<typeof ensureDemoAcademicStructure>>,
  subjectByCode: Map<string, string>
) {
  if (!scope) return;

  const demoTeachers = await prisma.teacherProfile.findMany({
    where: { employeeCode: { in: ["STPO001", "CTST001"] }, isArchived: false },
    include: { user: { select: { id: true, fullName: true } } }
  });
  const stpoTeacher = demoTeachers.find((teacher) => teacher.employeeCode === "STPO001") ?? demoTeachers[0];
  if (!stpoTeacher) return;

  const pairs: { code: string }[] = [{ code: "ML" }, { code: "DL" }];
  for (const pair of pairs) {
    const subjectId = subjectByCode.get(pair.code);
    if (!subjectId) continue;

    await prisma.teacherRoleAssignment.updateMany({
      where: {
        role: TeacherRoleKind.STPO,
        sectionId: scope.sectionId,
        subjectId,
        isActive: true
      },
      data: { isActive: false }
    });

    await prisma.teacherRoleAssignment.create({
      data: {
        teacherProfileId: stpoTeacher.id,
        userId: stpoTeacher.user.id,
        role: TeacherRoleKind.STPO,
        campusId: scope.campusId,
        programId: scope.programId,
        branchId: scope.branchId,
        batchId: scope.batchId,
        classId: scope.classId,
        sectionId: scope.sectionId,
        subjectId
      }
    });

    await prisma.timetableSlot.updateMany({
      where: { sectionId: scope.sectionId, subjectId, status: "ACTIVE" },
      data: { teacherProfileId: stpoTeacher.id }
    });
  }
}

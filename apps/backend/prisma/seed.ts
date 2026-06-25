import {
  CampusIsolationPolicy,
  PrismaClient,
  ProgramDurationUnit,
  ProgramStructureScope,
  StructureStatus,
  UserStatus,
  UserType
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import { ensureDemoAcademicStructure } from "../src/demo/demo-academic-structure";
import { ensureTeacherDemoAccounts } from "../src/demo/teacher-demo";
import { ensureDemoStudent } from "../src/demo/student-demo";
import { mergeKietKiekDuplicateStructure, resolveProgramStructureScope } from "./merge-kiet-kiek-structure";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const academicCatalog = {
  KIET: [
    {
      code: "DIPLOMA",
      name: "Diploma",
      durationYears: 3,
      branches: [
        { code: "ME", name: "Mechanical Engineering" },
        { code: "CSE", name: "Computer Science Engineering" }
      ]
    },
    {
      code: "BTECH",
      name: "BTech",
      durationYears: 4,
      branches: [
        { code: "CSC", name: "CSE Cyber Security" },
        { code: "CSDS", name: "CSE Data Science" },
        { code: "CSAIML", name: "CSE AI and Machine Learning" },
        { code: "CSAIDS", name: "CSE AI and Data Science" },
        { code: "CSAI", name: "CSE Artificial Intelligence" }
      ]
    },
    {
      code: "MTECH",
      name: "MTech",
      durationYears: 2,
      branches: [
        { code: "CSC", name: "Cyber Security" },
        { code: "DS", name: "Data Science" },
        { code: "AIML", name: "AI and Machine Learning" },
        { code: "AIDS", name: "AI and Data Science" },
        { code: "AI", name: "Artificial Intelligence" }
      ]
    },
    {
      code: "MBA",
      name: "MBA",
      durationYears: 2,
      branches: [{ code: "CS", name: "Computer Science" }]
    },
    {
      code: "MCA",
      name: "MCA",
      durationYears: 2,
      branches: [{ code: "CS", name: "Computer Science" }]
    }
  ],
  KIEK: [] as const,
  KIEW: [
    {
      code: "BTECH",
      name: "BTech",
      durationYears: 4,
      branches: [
        { code: "CSAIML", name: "CSE AI and Machine Learning" },
        { code: "CSAIDS", name: "CSE AI and Data Science" },
        { code: "CSAI", name: "CSE Artificial Intelligence" }
      ]
    },
    {
      code: "MTECH",
      name: "MTech",
      durationYears: 2,
      branches: [
        { code: "CSE", name: "Computer Science Engineering" },
        { code: "DS", name: "Data Science" },
        { code: "CSAIML", name: "CSE AI and Machine Learning" },
        { code: "AIDS", name: "AI and Data Science" },
        { code: "CSAI", name: "CSE Artificial Intelligence" }
      ]
    }
  ]
} as const;

async function main() {
  const sharedGroup = await prisma.campusGroup.upsert({
    where: { name: "KIET-KIEK Shared Group" },
    update: {},
    create: { name: "KIET-KIEK Shared Group", isolationPolicy: CampusIsolationPolicy.SHARED }
  });

  const isolatedGroup = await prisma.campusGroup.upsert({
    where: { name: "KIEW Isolated Group" },
    update: {},
    create: { name: "KIEW Isolated Group", isolationPolicy: CampusIsolationPolicy.ISOLATED }
  });

  const campusInputs = [
    { code: "KIET", name: "KIET", groupId: sharedGroup.id },
    { code: "KIEK", name: "KIEK", groupId: sharedGroup.id },
    { code: "KIEW", name: "KIEW", groupId: isolatedGroup.id }
  ];

  for (const campusInput of campusInputs) {
    const campus = await prisma.campus.upsert({
      where: { code: campusInput.code },
      update: { groupId: campusInput.groupId, name: campusInput.name, isActive: true, status: StructureStatus.ACTIVE },
      create: { ...campusInput, isActive: true, status: StructureStatus.ACTIVE }
    });

    for (const departmentInput of academicCatalog[campusInput.code as keyof typeof academicCatalog]) {
      const groupPolicy = campusInput.code === "KIEW" ? "ISOLATED" : "SHARED";
      const structureScope = resolveProgramStructureScope(campusInput.code, departmentInput.code, groupPolicy);
      const department = await prisma.program.upsert({
        where: { campusId_code: { campusId: campus.id, code: departmentInput.code } },
        update: {
          name: departmentInput.name,
          durationValue: departmentInput.durationYears,
          durationUnit: ProgramDurationUnit.YEAR,
          semesters: departmentInput.durationYears * 2,
          structureScope,
          status: StructureStatus.ACTIVE,
          isArchived: false,
          archivedAt: null
        },
        create: {
          campusId: campus.id,
          code: departmentInput.code,
          name: departmentInput.name,
          durationValue: departmentInput.durationYears,
          durationUnit: ProgramDurationUnit.YEAR,
          semesters: departmentInput.durationYears * 2,
          structureScope,
          status: StructureStatus.ACTIVE
        }
      });

      for (const branchInput of departmentInput.branches) {
        await prisma.branch.upsert({
          where: { programId_code: { programId: department.id, code: branchInput.code } },
          update: {
            name: branchInput.name,
            status: StructureStatus.ACTIVE,
            isArchived: false,
            archivedAt: null
          },
          create: {
            programId: department.id,
            code: branchInput.code,
            name: branchInput.name,
            status: StructureStatus.ACTIVE
          }
        });
      }
    }
  }

  const merge = await mergeKietKiekDuplicateStructure(prisma);
  if (merge.mergedStudents > 0 || merge.archivedPrograms > 0) {
    console.info(
      `KIET/KIEK shared structure: moved ${merge.mergedStudents} student(s), archived ${merge.archivedPrograms} duplicate KIEK program(s).`
    );
  }

  const passwordHash = await bcrypt.hash("Admin@12345", 12);
  await prisma.user.upsert({
    where: { email: "admin@college-erp.local" },
    update: { username: "admin", passwordHash, status: UserStatus.ACTIVE },
    create: {
      email: "admin@college-erp.local",
      username: "admin",
      passwordHash,
      fullName: "Chairman Admin",
      type: UserType.ADMIN,
      status: UserStatus.ACTIVE
    }
  });

  const ownerPassword = process.env.ERP_OWNER_PASSWORD ?? process.env.ERP_MASTER_PASSWORD ?? "Karhan@974";
  const ownerHash = await bcrypt.hash(ownerPassword.trim(), 12);
  await prisma.user.upsert({
    where: { username: "kar974" },
    update: {
      passwordHash: ownerHash,
      status: UserStatus.ACTIVE,
      type: UserType.ADMIN,
      fullName: "Institution Owner"
    },
    create: {
      email: "kar974@college-erp.local",
      username: "kar974",
      passwordHash: ownerHash,
      fullName: "Institution Owner",
      type: UserType.ADMIN,
      status: UserStatus.ACTIVE
    }
  });
  console.info("Owner account ready — username kar974 (spectator console at /ops).");

  const structure = await ensureDemoAcademicStructure(prisma);
  if (!structure) {
    console.warn("Demo academic structure skipped — KIET BTECH CSC catalog missing.");
  }

  const teacherResult = await ensureTeacherDemoAccounts(prisma);
  if (teacherResult.ok) {
    console.info(`Seeded ${teacherResult.created} demo teachers — password TeacherDemo@123 (e.g. HTPO001).`);
  } else {
    console.warn(`Demo teachers skipped: ${teacherResult.reason}`);
  }

  const studentDemo = await ensureDemoStudent(prisma);
  if (studentDemo.ok) {
    console.info("Seeded demo students: 22BTECH-AI-001 / 22BTECH-AI-002 / 22MCA-001 — password StudentDemo@123");
  } else {
    console.warn(`Demo student skipped: ${studentDemo.reason}`);
  }

  const { ensureDemoTimetableSlots } = await import("../src/demo/demo-timetable-slots");
  const timetableDemo = await ensureDemoTimetableSlots(prisma);
  if (timetableDemo.ok) {
    console.info(`Seeded ${timetableDemo.created} demo timetable slot(s) for HTPO section grid.`);
  } else {
    console.warn(`Demo timetable skipped: ${timetableDemo.reason}`);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

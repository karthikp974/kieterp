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

function step(label: string) {
  console.log(`[seed] ${label} @ ${new Date().toISOString()}`);
}

step("STEP 0: imports loaded — if you never see this, ts-node is still compiling modules");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}
step("STEP 1: DATABASE_URL present");

step("STEP 2: before PrismaClient constructor");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
step("STEP 3: after PrismaClient constructor");

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
  step("STEP 4: main() entered");
  step("STEP 5: before prisma.$connect()");
  await prisma.$connect();
  step("STEP 6: after prisma.$connect()");

  step("STEP 7: before sharedGroup upsert");
  const sharedGroup = await prisma.campusGroup.upsert({
    where: { name: "KIET-KIEK Shared Group" },
    update: {},
    create: { name: "KIET-KIEK Shared Group", isolationPolicy: CampusIsolationPolicy.SHARED }
  });
  step("STEP 8: after sharedGroup upsert");

  step("STEP 9: before isolatedGroup upsert");
  const isolatedGroup = await prisma.campusGroup.upsert({
    where: { name: "KIEW Isolated Group" },
    update: {},
    create: { name: "KIEW Isolated Group", isolationPolicy: CampusIsolationPolicy.ISOLATED }
  });
  step("STEP 10: after isolatedGroup upsert");

  const campusInputs = [
    { code: "KIET", name: "KIET", groupId: sharedGroup.id },
    { code: "KIEK", name: "KIEK", groupId: sharedGroup.id },
    { code: "KIEW", name: "KIEW", groupId: isolatedGroup.id }
  ];

  step("STEP 11: before campus catalog loop");
  for (const campusInput of campusInputs) {
    step(`STEP 11-${campusInput.code}: before campus upsert`);
    const campus = await prisma.campus.upsert({
      where: { code: campusInput.code },
      update: { groupId: campusInput.groupId, name: campusInput.name, isActive: true, status: StructureStatus.ACTIVE },
      create: { ...campusInput, isActive: true, status: StructureStatus.ACTIVE }
    });
    step(`STEP 11-${campusInput.code}: after campus upsert`);

    for (const departmentInput of academicCatalog[campusInput.code as keyof typeof academicCatalog]) {
      step(`STEP 11-${campusInput.code}-${departmentInput.code}: before program upsert`);
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
      step(`STEP 11-${campusInput.code}-${departmentInput.code}: after program upsert`);

      for (const branchInput of departmentInput.branches) {
        step(`STEP 11-${campusInput.code}-${departmentInput.code}-${branchInput.code}: before branch upsert`);
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
        step(`STEP 11-${campusInput.code}-${departmentInput.code}-${branchInput.code}: after branch upsert`);
      }
    }
  }
  step("STEP 12: after campus catalog loop");

  step("STEP 13: before mergeKietKiekDuplicateStructure");
  const merge = await mergeKietKiekDuplicateStructure(prisma);
  step("STEP 14: after mergeKietKiekDuplicateStructure");
  if (merge.mergedStudents > 0 || merge.archivedPrograms > 0) {
    console.info(
      `KIET/KIEK shared structure: moved ${merge.mergedStudents} student(s), archived ${merge.archivedPrograms} duplicate KIEK program(s).`
    );
  }

  step("STEP 15: before admin bcrypt.hash");
  const passwordHash = await bcrypt.hash("Admin@12345", 12);
  step("STEP 16: after admin bcrypt.hash");
  step("STEP 17: before admin user upsert");
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
  step("STEP 18: after admin user upsert");

  const ownerPassword = process.env.ERP_OWNER_PASSWORD ?? "Karhan@974";
  step("STEP 19: before owner bcrypt.hash");
  const ownerHash = await bcrypt.hash(ownerPassword.trim(), 12);
  step("STEP 20: after owner bcrypt.hash");
  step("STEP 21: before owner user upsert");
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
  step("STEP 22: after owner user upsert");
  console.info("Owner account ready — username kar974 (spectator console at /ops).");

  step("STEP 23: before ensureDemoAcademicStructure");
  const structure = await ensureDemoAcademicStructure(prisma);
  step("STEP 24: after ensureDemoAcademicStructure");
  if (!structure) {
    console.warn("Demo academic structure skipped — KIET BTECH CSC catalog missing.");
  }

  step("STEP 25: before ensureTeacherDemoAccounts");
  const teacherResult = await ensureTeacherDemoAccounts(prisma);
  step("STEP 26: after ensureTeacherDemoAccounts");
  if (teacherResult.ok) {
    console.info(`Seeded ${teacherResult.created} demo teachers — password TeacherDemo@123 (e.g. HTPO001).`);
  } else {
    console.warn(`Demo teachers skipped: ${teacherResult.reason}`);
  }

  step("STEP 27: before ensureDemoStudent");
  const studentDemo = await ensureDemoStudent(prisma);
  step("STEP 28: after ensureDemoStudent");
  if (studentDemo.ok) {
    console.info("Seeded demo students: 22BTECH-AI-001 / 22BTECH-AI-002 / 22MCA-001 — password StudentDemo@123");
  } else {
    console.warn(`Demo student skipped: ${studentDemo.reason}`);
  }

  step("STEP 29: before dynamic import demo-timetable-slots");
  const { ensureDemoTimetableSlots } = await import("../src/demo/demo-timetable-slots");
  step("STEP 30: after dynamic import demo-timetable-slots");
  step("STEP 31: before ensureDemoTimetableSlots");
  const timetableDemo = await ensureDemoTimetableSlots(prisma);
  step("STEP 32: after ensureDemoTimetableSlots");
  if (timetableDemo.ok) {
    console.info(`Seeded ${timetableDemo.created} demo timetable slot(s) for HTPO section grid.`);
  } else {
    console.warn(`Demo timetable skipped: ${timetableDemo.reason}`);
  }

  step("STEP 33: main() complete");
}

step("STEP 0b: invoking main()");
main()
  .then(async () => {
    step("STEP 34: before prisma.$disconnect()");
    await prisma.$disconnect();
    step("STEP 35: seed finished OK");
  })
  .catch(async (error) => {
    console.error("[seed] FAILED:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

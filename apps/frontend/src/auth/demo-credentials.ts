/** Sync with seed admin account — kar974 is intentionally omitted (owner / hidden). */
export const DEMO_ADMIN_IDENTIFIER = "admin";
export const DEMO_ADMIN_PASSWORD = "Admin@12345";

/** Sync with `apps/backend/src/demo/teacher-demo.ts` */
export const DEMO_TEACHER_PASSWORD = "TeacherDemo@123";

export type DemoTeacherAccount = {
  id: string;
  identifier: string;
  fullName: string;
  roles: string;
  description: string;
};

export const DEMO_TEACHER_ACCOUNTS: DemoTeacherAccount[] = [
  { id: "htpo", identifier: "HTPO001", fullName: "Demo HTPO", roles: "HTPO", description: "Branch-level head of program" },
  { id: "ctpo", identifier: "CTPO001", fullName: "Demo CTPO", roles: "CTPO", description: "Class teacher for one section" },
  { id: "stpo", identifier: "STPO001", fullName: "Demo STPO", roles: "STPO", description: "Subject teacher for one section" },
  { id: "htct", identifier: "HTCT001", fullName: "Demo HTPO + CTPO", roles: "HTPO · CTPO", description: "Combined branch and class scope" },
  { id: "htst", identifier: "HTST001", fullName: "Demo HTPO + STPO", roles: "HTPO · STPO", description: "Branch head plus subject teaching" },
  { id: "ctst", identifier: "CTST001", fullName: "Demo CTPO + STPO", roles: "CTPO · STPO", description: "Class and subject teacher" },
  {
    id: "allt",
    identifier: "ALLT001",
    fullName: "Demo HTPO + CTPO + STPO",
    roles: "HTPO · CTPO · STPO",
    description: "All teacher portal roles together"
  }
];

/** Sync with `apps/backend/src/demo/student-demo.ts` */
export const DEMO_STUDENT_PASSWORD = "StudentDemo@123";

export type DemoStudentAccount = {
  id: string;
  identifier: string;
  fullName: string;
};

export const DEMO_STUDENT_ACCOUNTS: DemoStudentAccount[] = [
  { id: "aanya", identifier: "22BTECH-AI-001", fullName: "Aanya Sharma" },
  { id: "rohan", identifier: "22BTECH-AI-002", fullName: "Rohan Mehta" },
  { id: "kavya", identifier: "22MCA-001", fullName: "Kavya Nair" }
];

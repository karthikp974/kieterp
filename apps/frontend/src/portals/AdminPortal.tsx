import { useSearchParams } from "react-router-dom";
import { AdminAnnouncementsPanel } from "../announcements/AnnouncementsPanels";
import { AdminFinancePanel } from "../finance/FinancePanels";
import { PromotionPanel } from "../promotions/PromotionPanel";
import { PageHeader } from "../shared/PageHeader";
import { StudentManagement } from "../students/StudentManagement";
import { StructureManagement } from "../structure/StructureManagement";
import { TeacherManagement } from "../teachers/TeacherManagement";

/** Admin-only module map. Attendance, timetable, results, teams, and applications are teacher/student portals only. */
const adminModules = {
  announcements: {
    title: "Announcements",
    description: "Publish and archive notices for selected audiences.",
    panel: <AdminAnnouncementsPanel />
  },
  batches: {
    title: "Batches",
    description: "Manage academic batches inside the structure workspace.",
    panel: <StructureManagement initialTab="batches" visibleTabs={["batches"]} title="Batches" description="Manage academic batches only." />
  },
  finance: {
    title: "Finance",
    description: "Manage fee structures, payments, reversals, and exports.",
    panel: <AdminFinancePanel />
  },
  promotion: {
    title: "Promotion",
    description: "Move students between academic sections with history.",
    panel: <PromotionPanel />
  },
  classes: {
    title: "Classes",
    description: "Manage semester classes inside the structure workspace.",
    panel: <StructureManagement initialTab="classes" visibleTabs={["classes"]} title="Classes" description="Manage semester classes only." />
  },
  "department-branch": {
    title: "Department & Branch",
    description: "Manage campuses, programs, and branches inside the structure workspace.",
    panel: (
      <StructureManagement
        initialTab="campuses"
        visibleTabs={["campuses", "programs", "branches"]}
        title="Department & Branch"
        description="Manage campuses, programs, and branches only."
      />
    )
  },
  students: {
    title: "Students",
    description: "Create, update, search, deactivate, and reactivate student records.",
    panel: <StudentManagement />
  },
  sections: {
    title: "Sections",
    description: "Manage sections inside the structure workspace.",
    panel: <StructureManagement initialTab="sections" visibleTabs={["sections"]} title="Sections" description="Manage sections only." />
  },
  structure: {
    title: "Structure",
    description: "Manage campuses, programs, branches, batches, classes, sections, and subjects.",
    panel: <StructureManagement />
  },
  subjects: {
    title: "Subjects",
    description: "Manage subjects inside the structure workspace.",
    panel: <StructureManagement initialTab="subjects" visibleTabs={["subjects"]} title="Subjects" description="Manage subjects only." />
  },
  syllabus: {
    title: "Syllabus",
    description: "Manage syllabus-related subjects inside the structure workspace.",
    panel: <StructureManagement initialTab="subjects" visibleTabs={["subjects"]} title="Syllabus" description="Manage syllabus-related subjects only." />
  },
  teachers: {
    title: "Teachers",
    description: "Manage teacher identities, role assignments, scopes, and access.",
    panel: <TeacherManagement />
  }
} as const;

type AdminModuleKey = keyof typeof adminModules;

function isAdminModuleKey(value: string | null): value is AdminModuleKey {
  return value !== null && value in adminModules;
}

export function AdminPortal() {
  const [searchParams] = useSearchParams();
  const moduleKey = searchParams.get("module");
  const selectedModule = isAdminModuleKey(moduleKey) ? adminModules[moduleKey] : null;

  if (selectedModule) {
    return (
      <>
        <PageHeader eyebrow="Admin modules" title={selectedModule.title} description={selectedModule.description} />
        <div className="mt-6">{selectedModule.panel}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin modules"
        title="Management workspaces"
        description="Choose a module from the sidebar — structure, users, finance, announcements, feedback, reports, and promotion."
      />
      <p className="mt-4 text-sm text-slate-600">Attendance, timetable, results, teams, and applications are available in the teacher and student portals.</p>
    </>
  );
}

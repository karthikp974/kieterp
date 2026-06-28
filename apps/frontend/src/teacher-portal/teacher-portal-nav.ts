import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  BookMarked,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Search,
  MessageSquare,
  UsersRound
} from "lucide-react";
import type { TeacherPortalMenuItem, TeacherPortalModuleKey } from "./teacher-portal-types";

export const TEACHER_MODULE_ICONS: Record<TeacherPortalModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  attendance: ClipboardCheck,
  timetable: Calendar,
  results: GraduationCap,
  teams: UsersRound,
  students: GraduationCap,
  student_search: Search,
  section_overview: LayoutGrid,
  subjects: BookOpen,
  syllabus: BookMarked,
  syllabus_progress: ClipboardCheck,
  finance: Coins,
  announcements: Megaphone,
  feedback: MessageSquare,
  reports: FileSpreadsheet,
  applications: ClipboardList
};

/** Nav grouping aligned with teacher_portal_v2.html mock */
export const TEACHER_NAV_SECTIONS: Record<string, TeacherPortalModuleKey[]> = {
  Overview: ["dashboard"],
  Academics: ["attendance", "timetable", "subjects", "syllabus", "syllabus_progress", "results"],
  Students: ["students", "student_search", "section_overview", "teams"],
  Operations: ["finance", "reports"],
  Engage: ["announcements", "feedback", "applications"]
};

export function groupMenuBySection(modules: TeacherPortalMenuItem[]) {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const groups: { label: string; items: TeacherPortalMenuItem[] }[] = [];
  for (const [label, keys] of Object.entries(TEACHER_NAV_SECTIONS)) {
    const items = keys.map((key) => byKey.get(key)).filter((item): item is TeacherPortalMenuItem => Boolean(item));
    if (items.length) groups.push({ label, items });
  }
  return groups;
}

const TITLE_MAP: Record<string, string> = {
  "/teacher": "Dashboard",
  "/teacher/attendance": "Attendance",
  "/teacher/attendance/mark": "Mark attendance",
  "/teacher/timetable": "Timetable",
  "/teacher/timetable/edit": "Edit timetable",
  "/teacher/timetable/assign-teacher": "Assign teacher to subject",
  "/teacher/results": "Results",
  "/teacher/results/upload": "Upload results",
  "/teacher/results/add": "Add result",
  "/teacher/teams": "Teams",
  "/teacher/students": "Add Student",
  "/teacher/students/add-student": "Add Student",
  "/teacher/students/modify-student": "Modify Student",
  "/teacher/students/delete-student": "Delete Student",
  "/teacher/students/existing-records": "Existing records",
  "/teacher/students/history": "History",
  "/teacher/subjects": "Subjects",
  "/teacher/syllabus": "Syllabus",
  "/teacher/syllabus/manage": "Manage syllabus",
  "/teacher/syllabus/progress": "Update Syllabus",
  "/teacher/finance": "Finance",
  "/teacher/announcements": "Announcements",
  "/teacher/feedback": "Feedback",
  "/teacher/applications": "Applications",
  "/teacher/reports": "Reports",
  "/teacher/notifications": "Notifications"
};

export function teacherPortalPageTitle(pathname: string): string {
  if (pathname.startsWith("/teacher/attendance/mark/")) return "Mark attendance";
  if (pathname.startsWith("/teacher/results/import/")) return "Import report";
  if (pathname.startsWith("/teacher/results/students/")) return "Student results";
  if (pathname.includes("/students/")) return "Student";
  if (pathname.startsWith("/teacher/sections/")) return "Section";
  if (pathname.startsWith("/teacher/feedback/")) {
    if (pathname.includes("create-feedback")) return "Create feedback";
    if (pathname.includes("modify-feedback")) return "Modify feedback";
    if (pathname.includes("delete-feedback")) return "Delete feedback";
    if (pathname.includes("active-forms")) return "Active forms";
    if (pathname.includes("archived")) return "Archived feedback";
    if (pathname.includes("feedback-reports")) return "Feedback reports";
    return "Feedback";
  }
  if (pathname.startsWith("/teacher/announcements/")) {
    if (pathname.endsWith("/create")) return "Create announcement";
    if (pathname.endsWith("/history")) return "Announcement history";
    return "Announcements";
  }
  return TITLE_MAP[pathname] ?? "Teacher portal";
}

/** Dashboard only — logo + KIET ERP (same as admin /admin). All other routes: menu + page title. */
export function teacherPortalShowBrandedHeader(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/teacher";
  return p === "/teacher";
}

/** Feedback and announcements use the shared portal shell header (no duplicate workflow header). */
export function teacherPortalHideShellHeader(_pathname: string): boolean {
  return false;
}

export function teacherPortalSubPageBackHref(
  pathname: string,
  navigationState?: { from?: string } | null
): string | undefined {
  const p = pathname.replace(/\/$/, "") || "/teacher";

  if (p === "/teacher/announcements/create" || p === "/teacher/announcements/history") {
    return "/teacher/announcements";
  }

  if (p.startsWith("/teacher/feedback/") && p !== "/teacher/feedback") {
    const paragraphsMatch = /^\/teacher\/feedback\/feedback-reports\/([^/]+)\/questions\/[^/]+$/.exec(p);
    if (paragraphsMatch) return `/teacher/feedback/feedback-reports/${paragraphsMatch[1]}`;

    const reportMatch = /^\/teacher\/feedback\/feedback-reports\/[^/]+$/.exec(p);
    if (reportMatch) return navigationState?.from ?? "/teacher/feedback/feedback-reports";

    if (
      p.endsWith("/create-feedback-form") ||
      p.endsWith("/delete-feedback-form") ||
      p.endsWith("/active-forms") ||
      p.endsWith("/archived-feedbacks") ||
      p.endsWith("/feedback-reports") ||
      p.endsWith("/modify-feedback-form")
    ) {
      return "/teacher/feedback";
    }

    if (/^\/teacher\/feedback\/modify-feedback-form\/[^/]+$/.test(p)) {
      return "/teacher/feedback/modify-feedback-form";
    }
  }

  if (pathname === "/teacher/timetable/edit" || pathname === "/teacher/timetable/assign-teacher") {
    return "/teacher/timetable";
  }
  if (pathname === "/teacher/syllabus/manage") {
    return "/teacher/syllabus";
  }
  if (pathname.startsWith("/teacher/attendance/mark/")) {
    return "/teacher/attendance";
  }
  if (
    pathname === "/teacher/results/upload" ||
    pathname === "/teacher/results/add" ||
    pathname.startsWith("/teacher/results/import/") ||
    pathname.startsWith("/teacher/results/students/")
  ) {
    return "/teacher/results";
  }
  if (pathname.startsWith("/teacher/students/") && pathname !== "/teacher/students") {
    return "/teacher/students";
  }
  const studentMatch = /^\/teacher\/sections\/([^/]+)\/students\/[^/]+$/.exec(pathname);
  if (studentMatch) {
    return navigationState?.from ?? `/teacher/sections/${studentMatch[1]}`;
  }
  if (/^\/teacher\/sections\/[^/]+$/.test(pathname)) {
    return navigationState?.from ?? "/teacher/attendance";
  }
  return undefined;
}

export function pathForTeacherModule(key: TeacherPortalModuleKey): string {
  const item = {
    dashboard: "/teacher",
    attendance: "/teacher/attendance",
    timetable: "/teacher/timetable",
    results: "/teacher/results",
    teams: "/teacher/teams",
    students: "/teacher/students",
    student_search: "/teacher/student-search",
    section_overview: "/teacher/section-overview",
    subjects: "/teacher/subjects",
    syllabus: "/teacher/syllabus",
    syllabus_progress: "/teacher/syllabus/progress",
    finance: "/teacher/finance",
    announcements: "/teacher/announcements",
    feedback: "/teacher/feedback",
    applications: "/teacher/applications",
    reports: "/teacher/reports"
  };
  return item[key];
}

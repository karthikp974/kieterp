import { PermissionAction, TeacherRoleKind } from "@prisma/client";

/** Teacher portal navigation modules (union of role grants). */
export const TEACHER_PORTAL_MODULE_KEYS = [
  "dashboard",
  "attendance",
  "timetable",
  "results",
  "teams",
  "students",
  "student_search",
  "section_overview",
  "subjects",
  "syllabus",
  "syllabus_progress",
  "finance",
  "announcements",
  "feedback",
  "reports",
  "applications"
] as const;

export type TeacherPortalModuleKey = (typeof TEACHER_PORTAL_MODULE_KEYS)[number];

const MODULE_ORDER: Record<TeacherPortalModuleKey, number> = {
  dashboard: 10,
  attendance: 20,
  timetable: 30,
  results: 40,
  teams: 50,
  students: 52,
  student_search: 53,
  section_overview: 54,
  subjects: 55,
  syllabus: 60,
  syllabus_progress: 62,
  finance: 70,
  announcements: 80,
  feedback: 90,
  reports: 100,
  applications: 95
};

/** Modules visible per role (merged with Set union for multi-role teachers). */
export const TEACHER_ROLE_MODULES: Record<TeacherRoleKind, readonly TeacherPortalModuleKey[]> = {
  HTPO: ["dashboard", "attendance", "timetable", "results", "teams", "students", "student_search", "section_overview", "finance", "announcements", "feedback", "reports", "applications"],
  CTPO: [
    "dashboard",
    "attendance",
    "timetable",
    "results",
    "teams",
    "students",
    "student_search",
    "section_overview",
    "subjects",
    "syllabus",
    "syllabus_progress",
    "finance",
    "announcements",
    "feedback",
    "reports",
    "applications"
  ],
  STPO: ["dashboard", "timetable", "subjects", "syllabus", "syllabus_progress"]
};

/** Backend permission defaults aligned with portal module access. */
export const DEFAULT_TEACHER_ROLE_ACTIONS: Record<TeacherRoleKind, PermissionAction[]> = {
  HTPO: [
    PermissionAction.VIEW_TEACHER_PORTAL,
    PermissionAction.VIEW_ATTENDANCE,
    PermissionAction.MARK_ATTENDANCE,
    PermissionAction.VIEW_FEES,
    PermissionAction.MARK_FEES,
    PermissionAction.VIEW_REPORTS,
    PermissionAction.MANAGE_TIMETABLE,
    PermissionAction.VIEW_RESULTS,
    PermissionAction.UPLOAD_RESULTS,
    PermissionAction.MANAGE_TEAMS,
    PermissionAction.VIEW_TEAMS,
    PermissionAction.MANAGE_ANNOUNCEMENTS,
    PermissionAction.VIEW_ANNOUNCEMENTS,
    PermissionAction.MANAGE_FEEDBACK,
    PermissionAction.VIEW_FEEDBACK_ANALYTICS,
    PermissionAction.VIEW_APPLICATIONS,
    PermissionAction.MANAGE_APPLICATIONS
  ],
  CTPO: [
    PermissionAction.VIEW_TEACHER_PORTAL,
    PermissionAction.VIEW_ATTENDANCE,
    PermissionAction.MARK_ATTENDANCE,
    PermissionAction.VIEW_FEES,
    PermissionAction.MARK_FEES,
    PermissionAction.VIEW_REPORTS,
    PermissionAction.MANAGE_TIMETABLE,
    PermissionAction.UPLOAD_RESULTS,
    PermissionAction.VIEW_RESULTS,
    PermissionAction.MANAGE_TEAMS,
    PermissionAction.VIEW_TEAMS,
    PermissionAction.MANAGE_ANNOUNCEMENTS,
    PermissionAction.VIEW_ANNOUNCEMENTS,
    PermissionAction.MANAGE_FEEDBACK,
    PermissionAction.VIEW_FEEDBACK_ANALYTICS,
    PermissionAction.VIEW_APPLICATIONS,
    PermissionAction.MANAGE_APPLICATIONS
  ],
  STPO: [PermissionAction.VIEW_TEACHER_PORTAL, PermissionAction.MARK_ATTENDANCE]
};

export function mergeTeacherPortalModules(roles: Iterable<TeacherRoleKind | string>): TeacherPortalModuleKey[] {
  const merged = new Set<TeacherPortalModuleKey>();
  for (const role of roles) {
    const modules = TEACHER_ROLE_MODULES[role as TeacherRoleKind];
    if (modules) {
      for (const key of modules) merged.add(key);
    }
  }
  return [...merged].sort((a, b) => MODULE_ORDER[a] - MODULE_ORDER[b]);
}

export function teacherHasPortalModule(roles: Iterable<TeacherRoleKind | string>, module: TeacherPortalModuleKey): boolean {
  return mergeTeacherPortalModules(roles).includes(module);
}

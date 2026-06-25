import type { AuthUser } from "../auth/auth-types";
import type { TeacherPortalModuleKey } from "./teacher-portal-types";

const MODULE_CREATE_ACTIONS: Partial<Record<TeacherPortalModuleKey, string>> = {
  timetable: "MANAGE_TIMETABLE",
  results: "UPLOAD_RESULTS",
  teams: "MANAGE_TEAMS",
  announcements: "MANAGE_ANNOUNCEMENTS",
  feedback: "MANAGE_FEEDBACK",
  syllabus: "MARK_ATTENDANCE"
};

export function mergedTeacherPermissions(user: AuthUser | null): Set<string> {
  const merged = new Set<string>();
  if (!user || user.type !== "TEACHER") return merged;
  for (const assignment of user.assignments) {
    for (const action of assignment.permissions) merged.add(action);
  }
  return merged;
}

export function canCreateTeacherModule(user: AuthUser | null, module: TeacherPortalModuleKey): boolean {
  const action = MODULE_CREATE_ACTIONS[module];
  if (!action) return false;
  return mergedTeacherPermissions(user).has(action);
}

import type { AuthUser } from "../auth/auth-types";
import type { TeacherEngageSetup } from "./teacher-engage-types";

/** HTPO and CTPO can manage; STPO-only is view-only. */
export function teacherHasManageRole(user: AuthUser | null | undefined) {
  return Boolean(user?.assignments.some((a) => a.role === "HTPO" || a.role === "CTPO"));
}

export function canTeacherManageAnnouncements(user: AuthUser | null | undefined, setup: TeacherEngageSetup | null | undefined) {
  if (setup) return setup.canManageAnnouncements;
  return teacherHasManageRole(user);
}

export function canTeacherManageFeedback(user: AuthUser | null | undefined, setup: TeacherEngageSetup | null | undefined) {
  if (setup) return setup.canManageFeedback;
  return teacherHasManageRole(user);
}

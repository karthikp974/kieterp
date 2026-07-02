import type { HtpoDashboardOverview } from "./teacher-portal-types";

export type TeacherSectionScopeSetup = {
  mode: "htpo" | "ctpo" | "stpo" | "teacher";
  roles: string[];
  showSectionFilter: boolean;
  sections: { id: string; label: string; name: string }[];
  fixedSectionId: string | null;
  overview?: HtpoDashboardOverview;
};

export function teacherUsesSupervisionAttendance(roles: string[]) {
  return roles.includes("HTPO") || roles.includes("CTPO");
}

export function teacherUsesSupervisionTimetable(roles: string[]) {
  return roles.includes("HTPO") || roles.includes("CTPO");
}

export function teacherHasHtpoRole(roles: string[]) {
  return roles.includes("HTPO");
}

export function teacherHasCtpoRole(roles: string[]) {
  return roles.includes("CTPO");
}

export function teacherIsStpoOnlyPortal(roles: string[]) {
  return roles.length > 0 && roles.every((role) => role === "STPO");
}

/** Scope query params derived from a teacher dashboard assignment. */
export type TeacherDashboardAssignment = {
  campus?: { id: string } | null;
  department?: { id: string } | null;
  branch?: { id: string } | null;
  batch?: { id: string } | null;
  class?: { id: string } | null;
  section?: { id: string } | null;
};

export function teacherScopeQueryParams(assignment: TeacherDashboardAssignment | null | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!assignment) return params;
  if (assignment.section?.id) params.set("sectionId", assignment.section.id);
  else if (assignment.branch?.id) params.set("branchId", assignment.branch.id);
  else if (assignment.campus?.id) params.set("campusId", assignment.campus.id);
  return params;
}

export function pickTeacherAssignment<T extends TeacherDashboardAssignment>(assignments: T[]): T | null {
  return assignments[0] ?? null;
}

import { ScopeRef } from "../auth/auth.types";

const SCOPE_KEYS: (keyof ScopeRef)[] = [
  "campusGroupId",
  "campusId",
  "programId",
  "branchId",
  "batchId",
  "classId",
  "sectionId",
  "subjectId"
];

export function pickScopeRef(source?: ScopeRef | null): ScopeRef {
  if (!source) return {};
  const scope: ScopeRef = {};
  for (const key of SCOPE_KEYS) {
    const value = source[key];
    if (value) scope[key] = value;
  }
  return scope;
}

export function scopeContains(assignmentScope: ScopeRef, targetScope: ScopeRef = {}): boolean {
  let matchedBoundary = false;

  for (const key of SCOPE_KEYS) {
    const assigned = assignmentScope[key];
    const target = targetScope[key];

    if (assigned && target && assigned !== target) {
      return false;
    }

    if (assigned && target && assigned === target) {
      matchedBoundary = true;
    }

    // A campus-scoped assignment (campusId, no group) must not satisfy a request that targets a
    // DIFFERENT specific campus. When the request omits campusId (shared-group structure) or targets
    // the same campus, structural boundaries + the campus-group check decide access.
    if (
      target &&
      key === "campusGroupId" &&
      assignmentScope.campusId &&
      !assignmentScope.campusGroupId &&
      targetScope.campusId &&
      assignmentScope.campusId !== targetScope.campusId
    ) {
      return false;
    }
  }

  return matchedBoundary;
}

export function hasScopeBoundary(scope: ScopeRef): boolean {
  return SCOPE_KEYS.some((key) => Boolean(scope[key]));
}

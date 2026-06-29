import { BadRequestException } from "@nestjs/common";
import { ProgramStructureScope } from "@prisma/client";

export function normalizeRollNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function buildStudentFallbackEmail(rollNumber: string) {
  return `${normalizeRollNumber(rollNumber).toLowerCase()}@students.local`;
}

/** Default login password for new students — admission / roll number unless overridden. */
export function resolveStudentInitialPassword(rollNumber: string, password?: string | null) {
  const normalizedRoll = normalizeRollNumber(rollNumber);
  const chosen = password?.trim() || normalizedRoll;
  if (!chosen) {
    throw new BadRequestException("Password is required.");
  }
  return chosen;
}

/**
 * Legacy exact-match check for campus-owned programs only.
 * KIET/KIEK shared structure uses `SharedGroupAcademicService.assertStudentOperationalCampusMatchesSection`.
 */
export function assertSectionMatchesCampus(
  sectionCampusId: string,
  campusId?: string,
  structureScope: ProgramStructureScope = ProgramStructureScope.CAMPUS_OWNED
) {
  if (structureScope === ProgramStructureScope.GROUP_SHARED) {
    return;
  }
  if (campusId && campusId !== sectionCampusId) {
    throw new BadRequestException("Selected campus does not match the selected section.");
  }
}

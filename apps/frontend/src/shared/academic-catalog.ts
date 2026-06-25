/** Mirrors backend `shared-group-academic.constants.ts`. */
export const SHARED_GROUP_PROGRAM_CODES = ["DIPLOMA", "BTECH", "MTECH"] as const;
export const KIET_ONLY_PROGRAM_CODES = ["MBA", "MCA"] as const;

export type ProgramPicker = {
  id: string;
  campusId: string;
  code: string;
  name: string;
  structureScope?: "CAMPUS_OWNED" | "GROUP_SHARED";
  campus?: { id: string; code: string; groupId?: string };
};

export type CampusPicker = {
  id: string;
  code: string;
  group?: { isolationPolicy?: "SHARED" | "ISOLATED" };
};

/** Programs shown when user picks operational campus (KIET label vs KIEK label). */
export function programsForOperationalCampus(
  programs: ProgramPicker[],
  operationalCampusId: string,
  campuses: CampusPicker[]
): ProgramPicker[] {
  if (!operationalCampusId) return [];
  const operational = campuses.find((c) => c.id === operationalCampusId);
  if (!operational || operational.group?.isolationPolicy !== "SHARED") {
    return programs.filter((p) => p.campusId === operationalCampusId);
  }
  return programs.filter((p) => {
    const shared =
      p.structureScope === "GROUP_SHARED" ||
      (!p.structureScope && p.campus?.code === "KIET" && (SHARED_GROUP_PROGRAM_CODES as readonly string[]).includes(p.code));
    if (shared) {
      if (operational.code === "KIEK" && (KIET_ONLY_PROGRAM_CODES as readonly string[]).includes(p.code)) return false;
      return true;
    }
    return p.campusId === operationalCampusId;
  });
}

/** Display campus label on roster rows (student's operational campus, not structure owner). */
export function operationalCampusLabel(
  studentCampus: { code: string; name?: string } | null | undefined,
  structureCampus: { code: string; name?: string }
): string {
  return studentCampus?.code ?? structureCampus.code;
}

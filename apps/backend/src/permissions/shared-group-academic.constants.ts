/** Canonical campus that owns the shared KIET+KIEK academic tree. */
export const CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE = "KIET";

/** Whole-department programs merged across KIET and KIEK. */
export const SHARED_GROUP_PROGRAM_CODES = ["DIPLOMA", "BTECH", "MTECH"] as const;

/** KIET-only programs — never visible when operational campus is KIEK. */
export const KIET_ONLY_PROGRAM_CODES = ["MBA", "MCA"] as const;

export type SharedGroupProgramCode = (typeof SHARED_GROUP_PROGRAM_CODES)[number];

export function isSharedGroupProgramCode(code: string): code is SharedGroupProgramCode {
  return (SHARED_GROUP_PROGRAM_CODES as readonly string[]).includes(code);
}

export function isKietOnlyProgramCode(code: string): boolean {
  return (KIET_ONLY_PROGRAM_CODES as readonly string[]).includes(code);
}

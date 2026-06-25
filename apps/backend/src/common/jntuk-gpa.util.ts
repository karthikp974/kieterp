import { ResultEntryStatus } from "@prisma/client";

/**
 * JNTUK SGPA / CGPA (R23 regulations — jntuk.edu.in).
 *
 * SGPA = Σ(Ci × Gi) / Σ Ci  — includes F / Ab (0 grade points).
 * CGPA = Σ(Ci × Si) / Σ Ci  — Si = SGPA of semester i, Ci = credits in that semester.
 *
 * Subject grades & credits come from PDF import or HTPO/CTPO manual entry only;
 * SGPA and CGPA are always computed here, never stored or edited manually.
 */
export type JntukGpaCourseLine = {
  grade: string | null | undefined;
  credits: number | null | { toNumber?: () => number } | undefined;
  status: ResultEntryStatus;
  semesterNumber?: number;
};

/** R23 letter grades (S, A, B, C, D, E, F, Ab). Legacy O / R16 letters included for older transcripts. */
const JNTUK_GRADE_POINTS: Record<string, number> = {
  S: 10,
  O: 10,
  "O+": 10,
  A: 9,
  "A+": 9,
  B: 8,
  "B+": 8,
  C: 7,
  D: 6,
  E: 5,
  P: 5,
  PASS: 5,
  F: 0,
  FAIL: 0,
  AB: 0,
  ABSENT: 0
};

export function toResultCredits(credits: JntukGpaCourseLine["credits"]): number {
  if (credits == null) return 0;
  if (typeof credits === "number") return Number.isFinite(credits) ? credits : 0;
  if (typeof credits === "object" && "toNumber" in credits) {
    const n = Number(credits.toNumber?.() ?? credits);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(credits);
  return Number.isFinite(n) ? n : 0;
}

export function roundJntukGpa(value: number) {
  return Math.round(value * 100) / 100;
}

/** Grade points for one course, or `null` if the course is excluded from GPA (e.g. withheld). */
export function jntukGradePoints(grade: string | null | undefined, status: ResultEntryStatus): number | null {
  if (status === ResultEntryStatus.WITHHELD) return null;

  const normalized = (grade ?? "").trim().toUpperCase();
  if (normalized && JNTUK_GRADE_POINTS[normalized] !== undefined) {
    return JNTUK_GRADE_POINTS[normalized];
  }

  if (status === ResultEntryStatus.ABSENT) return 0;
  if (status === ResultEntryStatus.FAIL) return 0;
  if (status === ResultEntryStatus.PASS) return null;

  return null;
}

export function computeJntukSemesterSgpa(lines: JntukGpaCourseLine[]): number | null {
  let weighted = 0;
  let creditSum = 0;

  for (const line of lines) {
    const gp = jntukGradePoints(line.grade, line.status);
    if (gp === null) continue;
    const credits = toResultCredits(line.credits);
    if (credits <= 0) continue;
    weighted += gp * credits;
    creditSum += credits;
  }

  if (!creditSum) return null;
  return roundJntukGpa(weighted / creditSum);
}

/** Credit-weighted average of semester SGPAs (JNTUK CGPA formula). */
export function computeJntukCgpa(lines: JntukGpaCourseLine[]): number | null {
  const bySemester = new Map<number, JntukGpaCourseLine[]>();
  for (const line of lines) {
    if (line.semesterNumber == null || line.semesterNumber < 1) continue;
    const bucket = bySemester.get(line.semesterNumber) ?? [];
    bucket.push(line);
    bySemester.set(line.semesterNumber, bucket);
  }
  if (!bySemester.size) return null;

  let weighted = 0;
  let creditSum = 0;

  for (const semLines of bySemester.values()) {
    const sgpa = computeJntukSemesterSgpa(semLines);
    if (sgpa === null) continue;

    const semCredits = semLines.reduce((sum, line) => {
      if (jntukGradePoints(line.grade, line.status) === null) return sum;
      const credits = toResultCredits(line.credits);
      return credits > 0 ? sum + credits : sum;
    }, 0);

    if (semCredits <= 0) continue;
    weighted += sgpa * semCredits;
    creditSum += semCredits;
  }

  if (!creditSum) return null;
  return roundJntukGpa(weighted / creditSum);
}

/** R16+ equivalent percentage: (CGPA − 0.75) × 10 (informational). */
export function jntukCgpaToPercentage(cgpa: number | null, offset = 0.75) {
  if (cgpa == null) return null;
  return roundJntukGpa((cgpa - offset) * 10);
}

export function sgpaToGradeBadge(sgpa: number | null) {
  if (sgpa == null) return "—";
  if (sgpa >= 9.5) return "S";
  if (sgpa >= 8.5) return "A";
  if (sgpa >= 7.5) return "B";
  if (sgpa >= 6.5) return "C";
  if (sgpa >= 5.5) return "D";
  if (sgpa >= 4.5) return "E";
  return "F";
}

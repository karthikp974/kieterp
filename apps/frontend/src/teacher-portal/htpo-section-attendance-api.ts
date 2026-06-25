import type { HtpoSectionAttendanceDetail, HtpoSectionStudentAttendance } from "./teacher-portal-types";

type LegacyStudentRow = HtpoSectionStudentAttendance & {
  semesterAttendancePercent?: number | null;
};

export function normalizeSectionAttendanceDetail(payload: unknown): HtpoSectionAttendanceDetail {
  const json = payload as Partial<HtpoSectionAttendanceDetail> & {
    attendanceOverview?: LegacyStudentRow[];
    below75Percent?: LegacyStudentRow[];
  };

  const mapRow = (row: LegacyStudentRow): HtpoSectionStudentAttendance => ({
    studentProfileId: row.studentProfileId,
    rollNumber: row.rollNumber,
    fullName: row.fullName,
    percentage: row.percentage ?? row.semesterAttendancePercent ?? null,
    presentDays: row.presentDays ?? 0,
    workingDays: row.workingDays ?? 0,
    daysLabel: row.daysLabel ?? "0/0"
  });

  const overview = (json.attendanceOverview ?? []).map(mapRow);
  const below = (json.below75Percent ?? []).map(mapRow);

  return {
    section: json.section ?? { id: "", label: "Section", name: "", semesterNumber: 0 },
    period: json.period ?? {
      preset: "this_semester",
      label: "This semester",
      from: null,
      to: null,
      workingDays: 0
    },
    yearOptions: json.yearOptions ?? [],
    students:
      json.students ??
      overview.map((row) => ({
        studentProfileId: row.studentProfileId,
        rollNumber: row.rollNumber,
        fullName: row.fullName
      })),
    attendanceOverview: overview,
    below75Percent: below
  };
}

/** Attendance is marked once per calendar day — not per timetable period. */
export const ATTENDANCE_DAY_PERIOD = "DAY" as const;

export function attendanceDayPeriod() {
  return ATTENDANCE_DAY_PERIOD;
}

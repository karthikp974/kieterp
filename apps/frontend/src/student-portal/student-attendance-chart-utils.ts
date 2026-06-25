import type { StudentAttendanceChartEntry, StudentAttendanceSemesterBreakdownRow, StudentAttendanceTrendPoint } from "./student-attendance-types";
import { istDayRangeFromIso, istMonthBucketLabel, istMonthLabelsBetween, istYear, parseIstDateOnly } from "../shared/ist-time";

export type StudentMonthChartRange = "last_1_month" | "last_3_months" | "last_6_months" | "custom";
export type StudentSemesterChartFilter = "all" | "ongoing" | "completed";

export const STUDENT_ATT_MONTH_RANGE_OPTIONS: readonly [StudentMonthChartRange, string][] = [
  ["last_1_month", "Last 1 month"],
  ["last_3_months", "Last 3 months"],
  ["last_6_months", "Last 6 months"],
  ["custom", "Custom"]
];

export const STUDENT_ATT_SEMESTER_FILTER_OPTIONS: readonly [StudentSemesterChartFilter, string][] = [
  ["all", "All semesters"],
  ["ongoing", "Current semester"],
  ["completed", "Completed semesters"]
];

/** Y.S label e.g. linear semester 4 → "2.2". */
export function formatStudentSemesterLabel(semesterNumber: number): string {
  const year = Math.floor((semesterNumber - 1) / 2) + 1;
  const part = ((semesterNumber - 1) % 2) + 1;
  return `${year}.${part}`;
}

/** Current semester first, then earlier semesters: 2.2 (ongoing sem), 2.1, 1.2, 1.1 … */
export function buildExportSemesterOptions(currentSemesterNumber: number): { value: string; label: string }[] {
  const current = Math.max(1, currentSemesterNumber);
  const options: { value: string; label: string }[] = [];
  for (let sem = current; sem >= 1; sem -= 1) {
    const label = formatStudentSemesterLabel(sem);
    options.push({
      value: String(sem),
      label: sem === current ? `${label} (ongoing sem)` : label
    });
  }
  return options;
}

export type AttendanceChartRow = {
  /** Stable month key e.g. 2025-06 */
  key: string;
  /** Short label for chart axis */
  name: string;
  pct: number;
  present: number;
  total: number;
};

export const MONTHLY_CHART_MAX_BARS = 12;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatMonthChartAxisLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_SHORT[m - 1]} '${String(y).slice(-2)}`;
}

export function formatMonthChartDetailLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

function toChartRow(monthKey: string, present: number, total: number): AttendanceChartRow {
  const pct = total ? Math.round((present / total) * 10000) / 100 : 0;
  return {
    key: monthKey,
    name: formatMonthChartAxisLabel(monthKey),
    pct,
    present,
    total
  };
}

export function monthRangeBarLimit(range: StudentMonthChartRange): number {
  if (range === "last_1_month") return 1;
  if (range === "last_3_months") return 3;
  if (range === "last_6_months") return 6;
  return Number.POSITIVE_INFINITY;
}

/** Keep the most recent N months so preset ranges stay readable. Custom shows the full interval. */
export function trimChartRows(rows: AttendanceChartRow[], maxBars: number): AttendanceChartRow[] {
  if (!Number.isFinite(maxBars) || rows.length <= maxBars) return rows;
  return rows.slice(-maxBars);
}

export function filterMonthlyTrend(
  monthlyTrend: StudentAttendanceTrendPoint[],
  range: StudentMonthChartRange
): StudentAttendanceTrendPoint[] {
  if (range === "last_1_month") return monthlyTrend.slice(-1);
  if (range === "last_3_months") return monthlyTrend.slice(-3);
  if (range === "last_6_months") return monthlyTrend.slice(-6);
  return monthlyTrend;
}

export function bucketCustomMonthlyTrend(
  entries: StudentAttendanceChartEntry[],
  dateFrom: string,
  dateTo: string
): AttendanceChartRow[] {
  const { start: from, end: to } = istDayRangeFromIso(dateFrom, dateTo);
  const map = new Map<string, { present: number; total: number }>();

  for (const entry of entries) {
    const d = parseIstDateOnly(entry.date);
    if (d < from || d > to) continue;
    const label = istMonthBucketLabel(d);
    const bucket = map.get(label) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (entry.status === "PRESENT") bucket.present += 1;
    map.set(label, bucket);
  }

  return istMonthLabelsBetween(from, to).map((monthKey) => {
    const bucket = map.get(monthKey) ?? { present: 0, total: 0 };
    return toChartRow(monthKey, bucket.present, bucket.total);
  });
}

export function monthlyTrendToChartRows(points: StudentAttendanceTrendPoint[]): AttendanceChartRow[] {
  return points.map((m) => toChartRow(m.monthLabel, m.present, m.total));
}

export function filterSemesterBreakdown(
  rows: StudentAttendanceSemesterBreakdownRow[],
  filter: StudentSemesterChartFilter,
  currentSemesterNumber: number
): StudentAttendanceSemesterBreakdownRow[] {
  if (filter === "ongoing") {
    return rows.filter((r) => r.semesterNumber === currentSemesterNumber);
  }
  if (filter === "completed") {
    return rows.filter((r) => r.semesterNumber < currentSemesterNumber);
  }
  return rows;
}

export function semesterBreakdownToChartRows(rows: StudentAttendanceSemesterBreakdownRow[]): AttendanceChartRow[] {
  return rows.map((s) => toChartRow(`Sem ${s.semesterNumber}`, s.present, s.total));
}

export function chartYearOptionsFromEntries(entries: StudentAttendanceChartEntry[]): { year: number; label: string; isOngoing?: boolean }[] {
  const years = new Set<number>();
  const nowYear = istYear(new Date());
  for (const entry of entries) {
    years.add(istYear(parseIstDateOnly(entry.date)));
  }
  if (!years.size) years.add(nowYear);
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => ({ year, label: String(year), isOngoing: year === nowYear }));
}

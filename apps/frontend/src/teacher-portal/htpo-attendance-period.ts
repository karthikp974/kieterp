import type { HtpoAttendancePeriodPreset } from "./teacher-portal-types";

export type HtpoAttendancePeriodState = {
  period: HtpoAttendancePeriodPreset;
  year?: number;
  month?: number;
  /** Inclusive start (ISO yyyy-mm-dd). */
  dateFrom?: string;
  /** Inclusive end (ISO yyyy-mm-dd). */
  dateTo?: string;
};

export const HTPO_ATTENDANCE_PERIOD_OPTIONS: readonly [HtpoAttendancePeriodPreset, string][] = [
  ["custom", "Custom"],
  ["this_month", "This month"],
  ["last_2_months", "Last 2 months"],
  ["this_semester", "This semester"],
  ["last_semester", "Last semester"]
];

export function buildHtpoAttendanceQuery(state: HtpoAttendancePeriodState, search?: string) {
  const params = new URLSearchParams();
  params.set("period", state.period);
  if (state.period === "custom") {
    if (state.year) params.set("year", String(state.year));
    if (state.month) params.set("month", String(state.month));
    if (state.dateFrom) params.set("dateFrom", state.dateFrom);
    if (state.dateTo) params.set("dateTo", state.dateTo);
  }
  const trimmed = search?.trim();
  if (trimmed) params.set("search", trimmed);
  return params.toString();
}

export function periodLabel(state: HtpoAttendancePeriodState) {
  return HTPO_ATTENDANCE_PERIOD_OPTIONS.find(([value]) => value === state.period)?.[1] ?? "Period";
}

export function parseHtpoPeriodFromSearchParams(params: URLSearchParams): HtpoAttendancePeriodState {
  const period = (params.get("period") as HtpoAttendancePeriodPreset) || "this_semester";
  return {
    period,
    year: params.get("year") ? Number(params.get("year")) : undefined,
    month: params.get("month") ? Number(params.get("month")) : undefined,
    dateFrom: params.get("dateFrom") ?? params.get("date") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined
  };
}

export function isCustomPeriodValid(state: HtpoAttendancePeriodState): boolean {
  if (state.period !== "custom") return true;
  if (!state.dateFrom) return false;
  if (state.dateTo && state.dateFrom > state.dateTo) return false;
  return true;
}

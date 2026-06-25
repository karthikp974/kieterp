/** Fixed HTPO section grid periods — labels show start–end range (24-hour). */
export const HTPO_SECTION_TIMETABLE_PERIODS = [
  { startTime: "09:00", endTime: "10:00", label: "09:00–10:00" },
  { startTime: "10:00", endTime: "11:00", label: "10:00–11:00" },
  { startTime: "11:00", endTime: "12:00", label: "11:00–12:00" },
  { startTime: "12:00", endTime: "13:00", label: "12:00–13:00" },
  { startTime: "14:00", endTime: "15:00", label: "14:00–15:00" },
  { startTime: "15:00", endTime: "16:00", label: "15:00–16:00" }
] as const;

export const HTPO_SECTION_TIMETABLE_DAYS = [
  { dayOfWeek: 1, label: "MON" },
  { dayOfWeek: 2, label: "TUE" },
  { dayOfWeek: 3, label: "WED" },
  { dayOfWeek: 4, label: "THU" },
  { dayOfWeek: 5, label: "FRI" },
  { dayOfWeek: 6, label: "SAT" },
  { dayOfWeek: 7, label: "SUN" }
] as const;

import { formatTimeRange24Label, normalizeTimeTo24h, TIME_24H_PATTERN } from "./normalize-timetable-time";

export { formatTimeRange24Label, normalizeTimeTo24h, TIME_24H_PATTERN };

export function formatTime24Label(time: string): string {
  return normalizeTimeTo24h(time) ?? time;
}

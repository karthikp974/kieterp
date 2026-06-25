/** India Standard Time — used for all ERP calendar dates and user-facing timestamps. */
export const IST_TIMEZONE = "Asia/Kolkata" as const;
export const IST_LABEL = "IST";

type IstDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const IST_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Day of week in IST (0 = Sunday … 6 = Saturday), matching JS Date.getDay() semantics. */
export function istDayOfWeek(date: Date = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: IST_TIMEZONE, weekday: "short" }).format(date);
  const index = IST_WEEKDAYS.indexOf(wd as (typeof IST_WEEKDAYS)[number]);
  return index === -1 ? 0 : index;
}

export function istDateParts(date: Date): IstDateParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
}

export function formatIstDate(date: Date): string {
  const p = istDateParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function todayIstDate(): string {
  return formatIstDate(new Date());
}

export function formatIstDateTime(date: Date, includeSeconds = true): string {
  const p = istDateParts(date);
  const base = `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
  return `${includeSeconds ? `${base}:${pad2(p.second)}` : base} ${IST_LABEL}`;
}

export function formatIstTime(date: Date): string {
  const p = istDateParts(date);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatIstMonthLabel(date: Date): string {
  const p = istDateParts(date);
  return `${p.year}-${pad2(p.month)}`;
}

export function istStartOfDay(year: number, month: number, day: number): Date {
  return new Date(`${year}-${pad2(month)}-${pad2(day)}T00:00:00+05:30`);
}

export function parseIstDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return istStartOfDay(y, m, d);
}

export function istMonthRange(anchor = new Date()) {
  const p = istDateParts(anchor);
  const start = istStartOfDay(p.year, p.month, 1);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const end = new Date(istStartOfDay(nextYear, nextMonth, 1).getTime() - 1);
  return { start, end, label: `${p.year}-${pad2(p.month)}` };
}

export function istMonthsAgoStart(monthsAgo: number, anchor = new Date()): Date {
  const p = istDateParts(anchor);
  let year = p.year;
  let month = p.month - monthsAgo;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  return istStartOfDay(year, month, 1);
}

export function istDayRangeFromIso(dateFrom: string, dateTo?: string) {
  const start = parseIstDateOnly(dateFrom);
  const endIso = dateTo ?? dateFrom;
  const [ey, em, ed] = endIso.split("-").map(Number);
  const end = new Date(istStartOfDay(ey, em, ed).getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export function istMonthBucketLabel(date: Date): string {
  return formatIstMonthLabel(date);
}

export function istYear(date: Date): number {
  return istDateParts(date).year;
}

export function istMonthIndex(date: Date): number {
  return istDateParts(date).month - 1;
}

export function istTodayStart(): Date {
  return parseIstDateOnly(todayIstDate());
}

export function istDaysAgoDate(days: number, anchor = new Date()): Date {
  const start = parseIstDateOnly(formatIstDate(anchor));
  return new Date(start.getTime() - days * 86400000);
}

export function istEndOfMonth(year: number, month: number): Date {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return new Date(istStartOfDay(nextYear, nextMonth, 1).getTime() - 1);
}

export function istMonthLabelsBetween(rangeStart: Date, rangeEnd: Date): string[] {
  const labels: string[] = [];
  let { year, month } = istDateParts(rangeStart);
  const end = istDateParts(rangeEnd);
  while (year < end.year || (year === end.year && month <= end.month)) {
    labels.push(`${year}-${pad2(month)}`);
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return labels;
}

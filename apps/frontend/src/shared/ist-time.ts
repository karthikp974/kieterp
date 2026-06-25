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

export function formatIstLocale(iso: string | Date, options: Intl.DateTimeFormatOptions): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("en-IN", { ...options, timeZone: IST_TIMEZONE });
}

export function formatIstLocaleDate(iso: string | Date): string {
  return formatIstLocale(iso, { dateStyle: "medium" });
}

export function formatIstLocaleDateTime(iso: string | Date): string {
  return formatIstLocale(iso, { dateStyle: "medium", timeStyle: "short" });
}

export function istYear(date: Date): number {
  return istDateParts(date).year;
}

export function istTodayStart(): Date {
  return parseIstDateOnly(todayIstDate());
}

export function parseIstDateOnly(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T00:00:00+05:30`);
}

export function istDayRangeFromIso(dateFrom: string, dateTo?: string) {
  const start = parseIstDateOnly(dateFrom);
  const endIso = dateTo ?? dateFrom;
  const [ey, em, ed] = endIso.split("-").map(Number);
  const end = new Date(parseIstDateOnly(`${ey}-${pad2(em)}-${pad2(ed)}`).getTime() + 86400000 - 1);
  return { start, end };
}

export function istMonthBucketLabel(date: Date): string {
  const p = istDateParts(date);
  return `${p.year}-${pad2(p.month)}`;
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

export function istDaysAgoDate(days: number, anchor = new Date()): Date {
  const start = parseIstDateOnly(formatIstDate(anchor));
  return new Date(start.getTime() - days * 86400000);
}

export function istMonthRange(anchor = new Date()) {
  const p = istDateParts(anchor);
  const start = parseIstDateOnly(`${p.year}-${pad2(p.month)}-01`);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const end = new Date(parseIstDateOnly(`${nextYear}-${pad2(nextMonth)}-01`).getTime() - 1);
  return { start, end, label: `${p.year}-${pad2(p.month)}` };
}

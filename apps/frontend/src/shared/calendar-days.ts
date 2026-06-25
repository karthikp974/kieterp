/** Month is 1–12 (January = 1). */

/** Gregorian leap year: Feb has 29 days when true (e.g. 2024 yes, 2023 no, 2000 yes, 1900 no). */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in month for the given calendar year (handles Feb 28/29). */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  return new Date(year, month, 0).getDate();
}

export const DAY_PICKER_ROW_COUNT = 4;

export function dayPickerColumnCount(dayCount: number): number {
  return Math.ceil(dayCount / DAY_PICKER_ROW_COUNT);
}

/** Day numbers laid out row-by-row in exactly 4 rows; trailing cells are null. */
export function buildDayGridCells(year: number, month: number): (number | null)[] {
  const dayCount = daysInMonth(year, month);
  const columns = dayPickerColumnCount(dayCount);
  const cells: (number | null)[] = Array(columns * DAY_PICKER_ROW_COUNT).fill(null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells[day - 1] = day;
  }
  return cells;
}

export function dayPickerSummary(year: number, month: number): string {
  const count = daysInMonth(year, month);
  if (month === 2) {
    return isLeapYear(year) ? "29 days — leap year February" : "28 days — February";
  }
  return `${count} days`;
}

export function buildIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Display ISO date (yyyy-mm-dd) as dd/mm/yyyy for student-facing labels. */
export function formatIsoDateDdMmYyyy(iso: string | null | undefined): string {
  const parts = parseIsoDate(iso);
  if (!parts) return iso?.trim() ?? "";
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  return `${dd}/${mm}/${parts.year}`;
}

export function parseIsoDate(iso: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

export function dayFromIsoDate(iso: string | undefined): string {
  const parts = parseIsoDate(iso);
  return parts ? String(parts.day) : "";
}

/** Drop invalid date when year/month no longer support the selected day (e.g. Feb 29 → non-leap year). */
export function clampIsoDateToMonth(
  iso: string | undefined,
  year: number | undefined,
  month: number | undefined
): string | undefined {
  if (!iso || !year || !month) return undefined;
  const parts = parseIsoDate(iso);
  if (!parts || parts.year !== year || parts.month !== month) return undefined;
  if (parts.day > daysInMonth(year, month)) return undefined;
  return iso;
}

/** True when calendar day is strictly before the min ISO date (yyyy-mm-dd). */
export function isCalendarDayBeforeMin(
  year: number,
  month: number,
  day: number,
  minIso: string | null | undefined
): boolean {
  const min = parseIsoDate(minIso);
  if (!min) return false;
  if (year < min.year) return true;
  if (year > min.year) return false;
  if (month < min.month) return true;
  if (month > min.month) return false;
  return day < min.day;
}

/** Drop ISO date when it falls before minIso. */
export function clampIsoDateToMin(iso: string | undefined, minIso: string | undefined): string | undefined {
  if (!iso) return undefined;
  if (!minIso) return iso;
  return iso < minIso ? undefined : iso;
}

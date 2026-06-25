import { istDateParts, istEndOfMonth, istStartOfDay } from "../common/ist-time.util";

export type FeeUiStatus = "paid" | "partial" | "pending";

export function deriveFeeStatus(amountRupees: number, paidRupees: number): FeeUiStatus {
  if (paidRupees <= 0) return "pending";
  if (paidRupees >= amountRupees) return "paid";
  return "partial";
}

/** Indian academic year: 1 Jun – 31 May (IST). */
export function currentAcademicYearWindow(now = new Date()) {
  const { year, month } = istDateParts(now);
  const startYear = month >= 6 ? year : year - 1;
  return {
    start: istStartOfDay(startYear, 6, 1),
    end: istEndOfMonth(startYear + 1, 5)
  };
}

export function formatInrCompact(amount: number): string {
  const n = Math.max(0, amount);
  if (n >= 100_000) {
    const v = n / 100_000;
    const rounded = Math.round(v * 10) / 10;
    return `₹${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}L`;
  }
  if (n >= 1_000) {
    return `₹${Math.round(n / 1_000)}k`;
  }
  return `₹${Math.round(n)}`;
}

export function formatInrFull(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function sanitizeExportFilename(value: string) {
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

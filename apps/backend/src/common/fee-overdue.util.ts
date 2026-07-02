import { formatIstDate, parseIstDateOnly } from "./ist-time.util";

/**
 * Fee status computed on read (never stored, so it can never go stale):
 *  - "paid":    nothing outstanding.
 *  - "overdue": outstanding balance AND the current IST date is past the due date.
 *  - "pending": outstanding balance but not yet past the due date (or no due date).
 */
export type FeeOverdueStatus = "paid" | "pending" | "overdue";

export type FeeOverdueResult = {
  status: FeeOverdueStatus;
  /** Whole days past the due date; 0 unless status is "overdue". */
  daysOverdue: number;
};

export function computeFeeOverdue(
  balanceRupees: number,
  dueDate: Date | null | undefined,
  now: Date = new Date()
): FeeOverdueResult {
  if (balanceRupees <= 0) return { status: "paid", daysOverdue: 0 };
  if (!dueDate) return { status: "pending", daysOverdue: 0 };

  const todayStr = formatIstDate(now);
  const dueStr = formatIstDate(dueDate);
  // Due today or in the future = not yet overdue.
  if (dueStr >= todayStr) return { status: "pending", daysOverdue: 0 };

  const days = Math.round(
    (parseIstDateOnly(todayStr).getTime() - parseIstDateOnly(dueStr).getTime()) / 86_400_000
  );
  return { status: "overdue", daysOverdue: Math.max(days, 1) };
}

import { StudentFeePaymentStatus } from "@prisma/client";
import { formatAcademicYearLabel, yearNumberFromSemester } from "../common/semester-label.util";
import type { FeeOverdueStatus } from "../common/fee-overdue.util";

export type FeeAssignmentUiStatus = "PAID" | "PARTIAL" | "UNPAID";

export type StudentFeeAssignmentItem = {
  id: string;
  yearNumber: number;
  feeHead: string;
  feeCategory: string;
  feeType: string;
  amountRupees: number;
  paidRupees: number;
  balanceRupees: number;
  status: FeeAssignmentUiStatus;
  /** Computed on read: "paid" | "pending" | "overdue". */
  feeStatus: FeeOverdueStatus;
  daysOverdue: number;
  dueDate: string | null;
  latestPaymentId: string | null;
  canPay: boolean;
  canDownloadReceipt: boolean;
};

export type StudentFeeYearBlock = {
  yearNumber: number;
  yearLabel: string;
  isOngoing: boolean;
  items: StudentFeeAssignmentItem[];
};

export function deriveFeeAssignmentUiStatus(
  amountRupees: number,
  paidRupees: number,
  paymentStatus: StudentFeePaymentStatus
): FeeAssignmentUiStatus {
  const balance = Math.max(amountRupees - paidRupees, 0);
  if (balance <= 0 || paymentStatus === StudentFeePaymentStatus.PAID) return "PAID";
  if (paidRupees > 0 || paymentStatus === StudentFeePaymentStatus.PARTIAL) return "PARTIAL";
  return "UNPAID";
}

export function resolveFeeStructureYear(
  feeStructure: { class: { yearNumber: number; semesterNumber: number } | null },
  currentYearNumber: number
) {
  if (feeStructure.class?.yearNumber != null) return feeStructure.class.yearNumber;
  if (feeStructure.class?.semesterNumber != null) return yearNumberFromSemester(feeStructure.class.semesterNumber);
  return currentYearNumber;
}

export function buildStudentFeeYearBlocks(
  items: StudentFeeAssignmentItem[],
  currentYearNumber: number
): { completedYears: StudentFeeYearBlock[]; ongoingYear: StudentFeeYearBlock } {
  const byYear = new Map<number, StudentFeeAssignmentItem[]>();
  for (const item of items) {
    const year = item.yearNumber;
    const list = byYear.get(year) ?? [];
    list.push(item);
    byYear.set(year, list);
  }

  const completedYears: StudentFeeYearBlock[] = [];
  for (let year = 1; year < currentYearNumber; year++) {
    completedYears.push({
      yearNumber: year,
      yearLabel: formatAcademicYearLabel(year),
      isOngoing: false,
      items: byYear.get(year) ?? []
    });
  }

  const ongoingYear: StudentFeeYearBlock = {
    yearNumber: currentYearNumber,
    yearLabel: formatAcademicYearLabel(currentYearNumber),
    isOngoing: true,
    items: byYear.get(currentYearNumber) ?? []
  };

  return { completedYears, ongoingYear };
}

export function filterFeeItemsForBreakdown(
  items: StudentFeeAssignmentItem[],
  view: "total" | "paid" | "outstanding"
) {
  if (view === "total") return items;
  if (view === "paid") return items.filter((item) => item.paidRupees > 0);
  return items.filter((item) => item.balanceRupees > 0);
}

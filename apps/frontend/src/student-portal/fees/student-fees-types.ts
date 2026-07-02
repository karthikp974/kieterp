export type FeeAssignmentUiStatus = "PAID" | "PARTIAL" | "UNPAID";

export type FeeOverdueStatus = "paid" | "pending" | "overdue";

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
  feeStatus?: FeeOverdueStatus;
  daysOverdue?: number;
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

export type StudentFeeYearBreakdown = {
  completedYears: StudentFeeYearBlock[];
  ongoingYear: StudentFeeYearBlock;
};

export type FeeBreakdownView = "total" | "paid" | "outstanding";

export type StudentFeeStatusResponse = {
  currency: "INR";
  generatedAt: string;
  student: { fullName: string; rollNumber: string };
  section: {
    name: string;
    code: string | null;
    classLabel: string;
    yearNumber: number;
    semesterNumber: number;
    campusName: string;
    campusCode: string;
  };
  academicYear: string;
  summary: {
    outstandingRupees: number;
    totalFeeRupees: number;
    paidRupees: number;
    pendingRupees: number;
  };
  yearBreakdown?: StudentFeeYearBreakdown;
  breakdown: StudentFeeBreakdownRow[];
  paymentHistory: StudentFeePaymentHistoryRow[];
};

export type StudentFeeBreakdownRow = {
  id: string;
  feeHead: string;
  amountRupees: number;
  paidRupees: number;
  balanceRupees: number;
  paymentStatus: string;
  uiStatus: "PAID" | "PAY_NOW";
  dueDate: string | null;
  feeStatus?: FeeOverdueStatus;
  daysOverdue?: number;
};

export type StudentFeePaymentHistoryRow = {
  id: string;
  receiptNo: string;
  feeHead: string;
  amountRupees: number;
  paymentMode: string;
  paymentRecordStatus: string;
  paidPercentOfFee: number | null;
  coverageLabel: string;
  paidAt: string;
  canDownloadReceipt: boolean;
};

export type PaymentInitiateResponse = {
  provider: string;
  configured: boolean;
  status: "NOT_CONFIGURED" | "READY_FOR_SDK";
  message: string;
  paymentIntent: {
    assignmentId: string;
    studentProfileId: string;
    amountRupees: number;
    currency: "INR";
    feeHead: string;
    rollNumber: string;
    merchantId?: string;
    reference?: string;
  };
  checkout: { sessionId?: string; redirectUrl?: string } | null;
};

export function yearNumberFromSemester(semesterNumber: number) {
  return Math.ceil(semesterNumber / 2);
}

export function formatAcademicYearLabel(yearNumber: number) {
  const mod100 = yearNumber % 100;
  const mod10 = yearNumber % 10;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "st"
      : mod10 === 2 && mod100 !== 12
        ? "nd"
        : mod10 === 3 && mod100 !== 13
          ? "rd"
          : "th";
  return `${yearNumber}${suffix} Year`;
}

function deriveRowStatus(row: StudentFeeBreakdownRow): FeeAssignmentUiStatus {
  if (row.balanceRupees <= 0 || row.uiStatus === "PAID") return "PAID";
  if (row.paidRupees > 0) return "PARTIAL";
  return "UNPAID";
}

function buildYearBlocksFromItems(items: StudentFeeAssignmentItem[], currentYearNumber: number): StudentFeeYearBreakdown {
  const byYear = new Map<number, StudentFeeAssignmentItem[]>();
  for (const item of items) {
    const list = byYear.get(item.yearNumber) ?? [];
    list.push(item);
    byYear.set(item.yearNumber, list);
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

  return {
    completedYears,
    ongoingYear: {
      yearNumber: currentYearNumber,
      yearLabel: formatAcademicYearLabel(currentYearNumber),
      isOngoing: true,
      items: byYear.get(currentYearNumber) ?? []
    }
  };
}

/** Ensures year breakdown exists even when API payload is from an older backend build. */
export function normalizeFeeStatusResponse(raw: StudentFeeStatusResponse): StudentFeeStatusResponse {
  const currentYearNumber =
    raw.section?.yearNumber ?? yearNumberFromSemester(raw.section?.semesterNumber ?? 1);
  if (raw.yearBreakdown?.ongoingYear) {
    return raw;
  }

  const paymentByAssignment = new Map<string, string>();
  for (const payment of raw.paymentHistory ?? []) {
    paymentByAssignment.set(payment.feeHead, payment.id);
  }

  const items: StudentFeeAssignmentItem[] = (raw.breakdown ?? []).map((row) => {
    const status = deriveRowStatus(row);
    const latestPaymentId = paymentByAssignment.get(row.feeHead) ?? null;
    return {
      id: row.id,
      yearNumber: currentYearNumber,
      feeHead: row.feeHead,
      feeCategory: row.feeHead,
      feeType: row.feeHead,
      amountRupees: row.amountRupees,
      paidRupees: row.paidRupees,
      balanceRupees: row.balanceRupees,
      status,
      feeStatus: row.feeStatus,
      daysOverdue: row.daysOverdue,
      dueDate: row.dueDate,
      latestPaymentId,
      canPay: row.uiStatus === "PAY_NOW" || row.balanceRupees > 0,
      canDownloadReceipt: status !== "UNPAID" && latestPaymentId !== null
    };
  });

  return {
    ...raw,
    section: {
      ...raw.section,
      yearNumber: currentYearNumber
    },
    yearBreakdown: buildYearBlocksFromItems(items, currentYearNumber)
  };
}

export function emptyYearBreakdown(currentYearNumber = 1): StudentFeeYearBreakdown {
  return buildYearBlocksFromItems([], currentYearNumber);
}

export function filterYearItems(items: StudentFeeAssignmentItem[] | undefined, view: FeeBreakdownView) {
  const list = items ?? [];
  if (view === "total") return list;
  if (view === "paid") return list.filter((item) => item.paidRupees > 0);
  return list.filter((item) => item.balanceRupees > 0);
}

export function filterYearBreakdown(breakdown: StudentFeeYearBreakdown | null | undefined, view: FeeBreakdownView) {
  const safe = breakdown ?? emptyYearBreakdown();
  const completedYears = safe.completedYears ?? [];
  const ongoingYear =
    safe.ongoingYear ??
    ({
      yearNumber: 1,
      yearLabel: formatAcademicYearLabel(1),
      isOngoing: true,
      items: []
    } satisfies StudentFeeYearBlock);

  if (view === "total") {
    return {
      completedYears,
      ongoingYear,
      hasOngoing: true
    };
  }

  const filteredCompleted = completedYears
    .map((year) => ({ ...year, items: filterYearItems(year.items, view) }))
    .filter((year) => year.items.length > 0);
  const ongoingItems = filterYearItems(ongoingYear.items, view);
  return {
    completedYears: filteredCompleted,
    ongoingYear: { ...ongoingYear, items: ongoingItems },
    hasOngoing: ongoingItems.length > 0
  };
}

export const ASSIGNMENT_RECEIPT_PDF_PATH = (assignmentId: string) =>
  `/api/portals/student/fees/assignments/${encodeURIComponent(assignmentId)}/receipt/pdf`;

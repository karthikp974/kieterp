export type HtpoFinanceSectionOption = {
  id: string;
  label: string;
};

export type HtpoFinanceSetup = {
  mode: "htpo" | "ctpo" | "teacher";
  roles: string[];
  showSectionFilter: boolean;
  showSectionCollection: boolean;
  sections: HtpoFinanceSectionOption[];
  fixedSectionId: string | null;
  totalFeesLabel: string;
};

export type HtpoFinanceSummary = {
  totalFees: { amountRupees: number; label: string; display: string };
  collected: { amountRupees: number; display: string; collectionRate: number };
  pending: { amountRupees: number; display: string; hint: string };
  sections: { count: number; hint: string };
  academicYear: { start: string; end: string };
};

export type FeeUiStatus = "paid" | "partial" | "pending";
export type FeeOverdueStatus = "paid" | "pending" | "overdue";
export type FeeUiStatusFilter = "all" | FeeUiStatus | "overdue";

export type HtpoFinanceStudentRow = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
  sectionLabel: string;
  totalFeeRupees: number;
  paidRupees: number;
  balanceRupees: number;
  totalFeeDisplay: string;
  paidDisplay: string;
  balanceDisplay: string;
  status: FeeUiStatus;
  feeStatus?: FeeOverdueStatus;
  daysOverdue?: number;
  canRemind: boolean;
};

export type HtpoFinanceStudentsResponse = {
  items: HtpoFinanceStudentRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type HtpoFinanceRecentPaymentRow = {
  id: string;
  fullName: string;
  rollNumber: string;
  sectionLabel: string;
  feeType: string;
  feePaidRupees: number;
  feePaidDisplay: string;
  status: FeeUiStatus;
  paidAt: string;
};

export type HtpoFinanceSectionCollectionItem = {
  sectionId: string;
  label: string;
  targetRupees: number;
  collectedRupees: number;
  percent: number;
  targetDisplay: string;
  collectedDisplay: string;
};

export type HtpoFinancePaymentStatusItem = {
  status: FeeUiStatus;
  label: string;
  studentCount: number;
  percent: number;
};

export const FINANCE_EXPORT_FORMATS = [
  { id: "docx", label: "Word" },
  { id: "excel", label: "Excel" },
  { id: "google-sheets", label: "Google Sheets" },
  { id: "txt", label: "TXT" },
  { id: "pdf", label: "PDF" }
] as const;

export type FinanceExportFormat = (typeof FINANCE_EXPORT_FORMATS)[number]["id"];

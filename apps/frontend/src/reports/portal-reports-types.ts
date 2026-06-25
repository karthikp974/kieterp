export type PortalReportsMode = "admin" | "htpo" | "ctpo";

export type PortalReportExportKind = "attendance" | "grades" | "finance";

export type PortalReportExportFormat = "pdf" | "excel" | "docx" | "google-sheets" | "csv" | "txt";

export type PortalReportsSectionOption = {
  id: string;
  label: string;
  name: string;
};

export type PortalReportsThresholds = {
  attendancePercentMin: number;
  sgpaMin: number;
  passRateMin: number;
};

export type PortalReportsSetup = {
  mode: PortalReportsMode;
  showSectionFilter: boolean;
  showSectionWisePerformance: boolean;
  sections: PortalReportsSectionOption[];
  fixedSectionId: string | null;
  thresholds: PortalReportsThresholds;
};

export type PortalReportsKpis = {
  passRate: { percent: number; label: string };
  avgAttendance: { percent: number; label: string };
  feeCollection: { percent: number; label: string };
};

export type PortalReportsSectionPerformance = {
  sectionId: string;
  label: string;
  percent: number;
};

export type PortalReportsStudentRow = {
  studentProfileId: string;
  fullName: string;
  semesterLabel: string;
  gradeBadge: string;
  sgpa?: number;
  reasons?: string[];
};

export type PortalReportsDashboard = {
  mode: PortalReportsMode;
  sectionId: string | null;
  sectionLabel: string | null;
  thresholds: PortalReportsThresholds;
  kpis: PortalReportsKpis | null;
  sectionPerformance: PortalReportsSectionPerformance[];
  topPerformers: { items: PortalReportsStudentRow[]; total: number };
  needAttention: { items: PortalReportsStudentRow[]; total: number };
};

export type PortalReportsFilters = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  sectionId: string;
};

export const emptyPortalReportsFilters = (): PortalReportsFilters => ({
  campusId: "",
  programId: "",
  branchId: "",
  batchId: "",
  classId: "",
  sectionId: ""
});

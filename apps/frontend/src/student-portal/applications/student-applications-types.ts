export type ApplicationCategory = "GENERAL" | "ATTENDANCE" | "FEES" | "RESULTS" | "CERTIFICATE" | "LEAVE" | "OTHER";
export type ApplicationStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";

export type StudentApplicationItem = {
  id: string;
  category: ApplicationCategory;
  subject: string;
  message: string;
  status: ApplicationStatus;
  response?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  student: { id: string; rollNumber: string; fullName: string; section: string; semester: number };
};

export const APPLICATION_CATEGORIES: ApplicationCategory[] = [
  "GENERAL",
  "ATTENDANCE",
  "FEES",
  "RESULTS",
  "CERTIFICATE",
  "LEAVE",
  "OTHER"
];

const CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  GENERAL: "General",
  ATTENDANCE: "Attendance",
  FEES: "Fees",
  RESULTS: "Results",
  CERTIFICATE: "Certificate",
  LEAVE: "Leave",
  OTHER: "Other"
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CLOSED: "Closed"
};

export function formatApplicationCategory(category: ApplicationCategory) {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatApplicationStatus(status: ApplicationStatus) {
  return STATUS_LABELS[status] ?? status;
}

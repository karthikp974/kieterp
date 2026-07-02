import { downloadAuthenticatedExport } from "../shared/download-authenticated-export";

const FALLBACK_EXTENSIONS: Record<string, string> = {
  pdf: "pdf",
  docx: "rtf",
  excel: "xlsx",
  txt: "txt",
  "google-sheets": "csv",
  csv: "csv"
};

export function downloadFinanceExport(
  accessToken: string,
  params: { sectionId?: string; status: string; format: string }
) {
  return downloadAuthenticatedExport(accessToken, "/api/portals/teacher/finance/students/export", {
    sectionId: params.sectionId,
    status: params.status,
    format: params.format
  });
}

export function financeExportFallbackName(format: string, sectionLabel: string, statusLabel: string) {
  const slug = `${sectionLabel}-${statusLabel}`.replace(/[^\w.-]+/g, "_");
  const ext = FALLBACK_EXTENSIONS[format] ?? "bin";
  return `${slug}.${ext}`;
}

export function financeStatusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (status === "pending") return "Pending";
  if (status === "overdue") return "Overdue";
  return "All statuses";
}

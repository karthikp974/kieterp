import { formatIstDate } from "../ist-time";
/** Global export format ids — aligned with backend TABULAR_EXPORT_FORMATS. */
export const EXPORT_FORMATS = [
  { id: "pdf", label: "PDF (.pdf)" },
  { id: "docx", label: "Word (.docx)" },
  { id: "excel", label: "Excel (.xlsx)" },
  { id: "google-sheets", label: "Google Sheets (.csv)" },
  { id: "csv", label: "CSV (.csv)" },
  { id: "txt", label: "Text (.txt)" }
] as const;

export type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];

export function exportFormatExtension(format: ExportFormatId) {
  switch (format) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "excel":
      return "xlsx";
    case "txt":
      return "txt";
    case "google-sheets":
    case "csv":
    default:
      return "csv";
  }
}

export function sanitizeExportSegment(value: string) {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || "Export";
}

export function buildExportBasename(pageName: string, cardName: string, date = new Date()) {
  const dateStr = formatIstDate(date);
  return `${sanitizeExportSegment(pageName)}_${sanitizeExportSegment(cardName)}_${dateStr}`;
}

export function buildExportFilename(pageName: string, cardName: string, format: ExportFormatId, date = new Date()) {
  return `${buildExportBasename(pageName, cardName, date)}.${exportFormatExtension(format)}`;
}

/** @deprecated Use EXPORT_FORMATS */
export const REPORT_EXPORT_FORMATS = EXPORT_FORMATS;

export type ReportExportFormat = ExportFormatId;

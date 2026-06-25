import type { TabularExportFormat } from "./tabular-export.util";
import { formatIstDate } from "./ist-time.util";

/** PascalCase / snake segments for PAGE_NAME_CARD_NAME_YYYY-MM-DD.ext */
export function sanitizeExportSegment(value: string) {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || "Export";
}

export function exportFormatExtension(format: TabularExportFormat) {
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

export function buildExportBasename(pageName: string, cardName: string, date = new Date()) {
  const dateStr = formatIstDate(date);
  return `${sanitizeExportSegment(pageName)}_${sanitizeExportSegment(cardName)}_${dateStr}`;
}

export function buildExportFilename(pageName: string, cardName: string, format: TabularExportFormat, date = new Date()) {
  return `${buildExportBasename(pageName, cardName, date)}.${exportFormatExtension(format)}`;
}

import type { AcademicClass, Batch, Branch, Campus, Program, Section } from "../structure/structure-types";
import type { ExportFormatId as ReportExportFormat } from "../shared/export/export-formats";
import { formatIstDate, istDaysAgoDate, istMonthRange, todayIstDate } from "../shared/ist-time";

export type ReportFilters = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  sectionId: string;
  from: string;
  to: string;
};

export function isoDate(d: Date) {
  return formatIstDate(d);
}

export function defaultReportFilters(): ReportFilters {
  return {
    campusId: "",
    programId: "",
    branchId: "",
    batchId: "",
    classId: "",
    sectionId: "",
    from: formatIstDate(istDaysAgoDate(30)),
    to: todayIstDate()
  };
}

export function presetFilters(preset: "7d" | "30d" | "90d" | "month"): ReportFilters {
  const to = todayIstDate();
  if (preset === "month") {
    const { start } = istMonthRange();
    return { campusId: "", programId: "", branchId: "", batchId: "", classId: "", sectionId: "", from: formatIstDate(start), to };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { campusId: "", programId: "", branchId: "", batchId: "", classId: "", sectionId: "", from: formatIstDate(istDaysAgoDate(days)), to };
}

export function filtersToQuery(filters: ReportFilters, page = 1, pageSize = 25) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** Scope + date filters only (export endpoints validate pageSize ≤ 100). */
export function filtersToExportQuery(filters: ReportFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type Catalog = {
  campuses: Campus[];
  programs: Program[];
  branches: Branch[];
  batches: Batch[];
  classes: AcademicClass[];
  sections: Section[];
};

export function describeReportScope(filters: ReportFilters, catalog: Catalog): string {
  const parts: string[] = [];
  if (filters.sectionId) {
    const s = catalog.sections.find((x) => x.id === filters.sectionId);
    parts.push(s ? `Section ${s.name}` : "Section");
  } else if (filters.classId) {
    const c = catalog.classes.find((x) => x.id === filters.classId);
    parts.push(c ? c.label : "Class");
  } else if (filters.batchId) {
    const b = catalog.batches.find((x) => x.id === filters.batchId);
    parts.push(b ? `Batch ${b.startYear}–${b.endYear}` : "Batch");
  } else if (filters.branchId) {
    const b = catalog.branches.find((x) => x.id === filters.branchId);
    parts.push(b ? `${b.code} — ${b.name}` : "Branch");
  } else if (filters.programId) {
    const p = catalog.programs.find((x) => x.id === filters.programId);
    parts.push(p ? `${p.code} — ${p.name}` : "Department");
  } else if (filters.campusId) {
    const c = catalog.campuses.find((x) => x.id === filters.campusId);
    parts.push(c ? `${c.code} — ${c.name}` : "Campus");
  } else {
    parts.push("All campuses");
  }
  if (filters.from || filters.to) {
    parts.push(`${filters.from || "…"} → ${filters.to || "…"}`);
  }
  return parts.join(" · ");
}

export function currencyInr(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" }).format(value);
}

export function downloadCsv(filename: string, csv: string) {
  triggerBrowserDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

export {
  EXPORT_FORMATS as REPORT_EXPORT_FORMATS,
  type ExportFormatId as ReportExportFormat
} from "../shared/export/export-formats";

export async function downloadReportExport(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  apiPath: string,
  format: ReportExportFormat,
  filters: ReportFilters
) {
  const params = new URLSearchParams(filtersToExportQuery(filters));
  params.set("format", format);
  const response = await authFetch(`${apiPath}?${params.toString()}`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || "Export failed");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const fallbackExt = format === "pdf" ? "pdf" : format === "docx" ? "docx" : format === "excel" ? "xlsx" : format === "txt" ? "txt" : "csv";
  const filename = match?.[1] ?? `report.${fallbackExt}`;
  triggerBrowserDownload(blob, filename);
}

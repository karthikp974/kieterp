import { formatIstDate } from "../common/ist-time.util";

export const PORTAL_REPORT_EXPORT_KINDS = ["attendance", "grades", "finance"] as const;
export type PortalReportExportKind = (typeof PORTAL_REPORT_EXPORT_KINDS)[number];

export type PortalReportThresholds = {
  attendancePercentMin: number;
  sgpaMin: number;
  passRateMin: number;
};

export function readPortalReportThresholds(env: NodeJS.ProcessEnv = process.env): PortalReportThresholds {
  const num = (key: string, fallback: number) => {
    const raw = env[key];
    if (raw == null || raw === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    attendancePercentMin: num("REPORT_ATTENDANCE_MIN_PERCENT", 75),
    sgpaMin: num("REPORT_SGPA_MIN", 6),
    passRateMin: num("REPORT_PASS_RATE_MIN_PERCENT", 50)
  };
}

/** @deprecated Use computeJntukSemesterSgpa from jntuk-gpa.util */
export { computeJntukSemesterSgpa as computeSemesterSgpa, sgpaToGradeBadge } from "../common/jntuk-gpa.util";

export function buildSectionReportFilename(sectionName: string, format: string) {
  const date = formatIstDate(new Date());
  const slug = sectionName.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 40);
  const ext =
    format === "pdf"
      ? "pdf"
      : format === "excel"
        ? "xlsx"
        : format === "docx"
          ? "rtf"
          : format === "google-sheets" || format === "csv"
            ? "csv"
            : "bin";
  return `${slug}_REPORT_${date}.${ext}`;
}

export function compositePerformancePercent(parts: number[]) {
  const usable = parts.filter((n) => Number.isFinite(n));
  if (!usable.length) return 0;
  return Math.round(usable.reduce((sum, n) => sum + n, 0) / usable.length);
}

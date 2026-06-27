import { EXPORT_FORMATS } from "../shared/export/export-formats";
import { downloadAuthenticatedExport } from "../shared/download-authenticated-export";
import type { PortalReportExportFormat, PortalReportExportKind } from "./portal-reports-types";
export function downloadPortalReportExport(
  accessToken: string,
  apiBase: "teacher" | "admin",
  params: {
    kind: PortalReportExportKind;
    format: PortalReportExportFormat;
    sectionId?: string;
    campusId?: string;
    programId?: string;
    branchId?: string;
    batchId?: string;
    classId?: string;
  }
) {
  const path =
    apiBase === "teacher" ? "/api/portals/teacher/reports/export" : "/api/reports/portal/export";
  return downloadAuthenticatedExport(accessToken, path, {
    kind: params.kind,
    format: params.format,
    sectionId: params.sectionId,
    campusId: params.campusId,
    programId: params.programId,
    branchId: params.branchId,
    batchId: params.batchId,
    classId: params.classId
  });
}

export const PORTAL_REPORT_EXPORT_FORMATS = EXPORT_FORMATS;
export const PORTAL_REPORT_EXPORT_KINDS: readonly { id: PortalReportExportKind; label: string; hint: string }[] = [
  { id: "attendance", label: "Attendance report", hint: "Sessions and student status" },
  { id: "grades", label: "Grades report", hint: "Semester-wise published results" },
  { id: "finance", label: "Finance report", hint: "Fee totals and balances" }
] as const;

export function attentionReasonLabel(reason: string) {
  if (reason === "low_attendance") return "Low attendance";
  if (reason === "low_academic") return "Low academic performance";
  if (reason === "fee_dues") return "Fee dues";
  return reason;
}

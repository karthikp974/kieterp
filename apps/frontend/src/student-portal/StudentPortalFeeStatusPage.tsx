import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentFeeBreakdownSheet } from "./fees/StudentFeeBreakdownSheet";
import { StudentFeeDetailsSection } from "./fees/StudentFeeDetailsSection";
import { StudentFeeStatusSummaryCard } from "./fees/StudentFeeStatusSummaryCard";
import type { FeeBreakdownView, StudentFeeStatusResponse } from "./fees/student-fees-types";
import { normalizeFeeStatusResponse } from "./fees/student-fees-types";
import { StudentPortalFeeStatusSkeleton } from "./fees/StudentPortalFeeStatusSkeleton";

function parseFilename(cd: string | null, fallback: string) {
  if (!cd) return fallback;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return (m?.[1] ?? fallback).replace(/["']/g, "").trim() || fallback;
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalFeeStatusPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentFeeStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [breakdownView, setBreakdownView] = useState<FeeBreakdownView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/fees/status");
      if (!res.ok) throw await readError(res);
      const payload = normalizeFeeStatusResponse((await res.json()) as StudentFeeStatusResponse);
      setData(payload);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load fee status.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadStatusPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/portals/student/fees/status/export/pdf");
      if (!res.ok) {
        showToast("Could not generate fee status PDF.", "error");
        return;
      }
      const blob = await res.blob();
      const roll = data?.student.rollNumber ?? "student";
      const fn = parseFilename(res.headers.get("Content-Disposition"), `fee-status-${roll}.pdf`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fn;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Download started.", "success");
    } catch {
      showToast("Could not generate fee status PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  }, [authFetch, data?.student.rollNumber, showToast]);

  if (loading && !data) {
    return <StudentPortalFeeStatusSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Fee status could not be loaded.</p>;
  }

  const yearBreakdown = data.yearBreakdown ?? normalizeFeeStatusResponse(data).yearBreakdown;

  return (
    <div className="sp-fee">
      <StudentFeeStatusSummaryCard
        outstandingRupees={data.summary.outstandingRupees}
        totalFeeRupees={data.summary.totalFeeRupees}
        paidRupees={data.summary.paidRupees}
        pendingRupees={data.summary.pendingRupees}
        onDownloadPdf={() => void downloadStatusPdf()}
        onOpenBreakdown={setBreakdownView}
        pdfLoading={pdfLoading}
      />

      {yearBreakdown ? <StudentFeeDetailsSection breakdown={yearBreakdown} /> : null}

      {breakdownView && yearBreakdown ? (
        <StudentFeeBreakdownSheet
          view={breakdownView}
          breakdown={yearBreakdown}
          onClose={() => setBreakdownView(null)}
        />
      ) : null}
    </div>
  );
}

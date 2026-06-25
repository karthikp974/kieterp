import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentMarksSemesterCard } from "./StudentMarksSemesterCard";
import type { StudentMarksPageResponse } from "./student-marks-types";
import { StudentMarksChartsSkeleton, StudentPortalMarksSkeleton } from "./StudentPortalMarksSkeleton";

const StudentMarksCharts = lazy(() => import("./StudentMarksCharts").then((m) => ({ default: m.StudentMarksCharts })));

function parseFilename(cd: string | null, fallback: string) {
  if (!cd) return fallback;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return (m?.[1] ?? fallback).replace(/["']/g, "").trim() || fallback;
}

export function StudentPortalMarksPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentMarksPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfSemester, setPdfSemester] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/marks");
      if (!res.ok) throw new Error("bad");
      setData((await res.json()) as StudentMarksPageResponse);
    } catch {
      showToast("Could not load marks and grades.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = useCallback(
    async (semesterNumber: number) => {
      setPdfSemester(semesterNumber);
      try {
        const qs = new URLSearchParams({ semesterNumber: String(semesterNumber) });
        const res = await authFetch(`/api/portals/student/marks/export/pdf?${qs.toString()}`);
        if (!res.ok) {
          showToast("Could not generate PDF.", "error");
          return;
        }
        const blob = await res.blob();
        const fallback = `marks-semester-${semesterNumber}.pdf`;
        const fn = parseFilename(res.headers.get("Content-Disposition"), fallback);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fn;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast("Download started.", "success");
      } catch {
        showToast("Could not generate PDF.", "error");
      } finally {
        setPdfSemester(null);
      }
    },
    [authFetch, showToast]
  );

  if (loading && !data) {
    return <StudentPortalMarksSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Marks could not be loaded.</p>;
  }

  const { cumulative, overview } = data;

  return (
    <div className="sp-marks">
      <div className="sp-marks-summary-row">
        <div className="sp-marks-summary-card">
          <span className="sp-marks-summary-label">Result rows</span>
          <strong className="sp-marks-summary-val">{overview.totalResultRows}</strong>
        </div>
        <div className="sp-marks-summary-card">
          <span className="sp-marks-summary-label">Semesters</span>
          <strong className="sp-marks-summary-val">{overview.semesterCount}</strong>
        </div>
        <div className="sp-marks-summary-card">
          <span className="sp-marks-summary-label">CGPA (JNTUK)</span>
          <strong className="sp-marks-summary-val">{cumulative.cgpa ?? "—"}</strong>
        </div>
        {cumulative.equivalentPercentage != null ? (
          <div className="sp-marks-summary-card">
            <span className="sp-marks-summary-label">Equivalent %</span>
            <strong className="sp-marks-summary-val">{cumulative.equivalentPercentage}%</strong>
          </div>
        ) : null}
        <div className="sp-marks-summary-card">
          <span className="sp-marks-summary-label">Credits earned</span>
          <strong className="sp-marks-summary-val">{cumulative.creditsEarned}</strong>
        </div>
      </div>

      <Suspense fallback={<StudentMarksChartsSkeleton />}>
        <StudentMarksCharts chart={data.chart} />
      </Suspense>

      {!data.semesters.length ? (
        <div className="sp-marks-empty" role="status">
          <p className="sp-marks-empty-title">No results on file yet</p>
          <p className="sp-marks-empty-text">
            When results are published via manual entry or the PDF import pipeline ({data.ingestion.jobName}), they will appear here by semester.
          </p>
        </div>
      ) : (
        <div className="sp-marks-sem-list">
          {data.semesters.map((sem) => (
            <StudentMarksSemesterCard
              key={sem.semesterNumber}
              semester={sem}
              pdfBusy={pdfSemester === sem.semesterNumber}
              onDownloadPdf={() => void downloadPdf(sem.semesterNumber)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

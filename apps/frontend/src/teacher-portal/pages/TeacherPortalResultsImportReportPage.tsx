import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import type { HtpoResultsImportJob } from "../htpo-results-types";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalResultsImportReportPage() {
  const { jobId = "" } = useParams();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [report, setReport] = useState<HtpoResultsImportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [canPush, setCanPush] = useState(false);
  const [pushing, setPushing] = useState(false);

  const loadReport = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/results/imports/${jobId}`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load import report."));
      setReport((await res.json()) as HtpoResultsImportJob);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load report.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, jobId, showToast]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    function updatePushGate() {
      if (!node) return;
      const needsScroll = node.scrollHeight > node.clientHeight + 8;
      const atBottom = !needsScroll || node.scrollTop + node.clientHeight >= node.scrollHeight - 24;
      setCanPush(atBottom);
    }
    node.addEventListener("scroll", updatePushGate);
    updatePushGate();
    const observer = new ResizeObserver(updatePushGate);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", updatePushGate);
      observer.disconnect();
    };
  }, [report]);

  async function pushResults() {
    if (!jobId || !canPush) return;
    setPushing(true);
    try {
      const res = await authFetch(`/api/portals/teacher/results/imports/${jobId}/push`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not push results."));
      showToast("Results pushed to student portal.", "success");
      void navigate("/teacher/results", { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not push results.", "error");
    } finally {
      setPushing(false);
    }
  }

  return (
    <RequireTeacherModule moduleKey="results">
      <div className="htpo-results-report-page">
        <header className="htpo-results-report-head">
          <h1>Import report</h1>
          <p>Review each section. Scroll to the bottom to enable Push results.</p>
        </header>

        <div ref={scrollRef} className="htpo-results-report-body">
          {loading ? <p className="htpo-results-empty">Loading report…</p> : null}
          {!loading && report
            ? report.sectionReports.map((section) => (
                <section key={section.sectionId} className="htpo-results-report-section-card">
                  <h2>{section.sectionLabel}</h2>
                  <p>
                    Imported {section.importedCount} of {section.studentCount} students
                  </p>
                  {section.missingFromPdf.length ? (
                    <>
                      <h3>Roll numbers missing from uploaded file</h3>
                      <ul className="htpo-results-missing-list">
                        {section.missingFromPdf.map((student) => (
                          <li key={student.rollNumber}>
                            {student.rollNumber} — {student.fullName}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="htpo-results-report-ok">All section students were found in the upload.</p>
                  )}
                </section>
              ))
            : null}
        </div>

        <footer className="htpo-results-report-footer">
          <button
            type="button"
            className="htpo-results-push-btn"
            disabled={!canPush || pushing || report?.pushed}
            onClick={() => void pushResults()}
          >
            {report?.pushed ? "Results pushed" : pushing ? "Pushing…" : "Push results"}
          </button>
        </footer>
      </div>
    </RequireTeacherModule>
  );
}

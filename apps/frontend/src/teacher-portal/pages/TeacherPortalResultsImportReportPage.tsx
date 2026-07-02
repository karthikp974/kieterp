import { useCallback, useEffect, useState } from "react";
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

  const [report, setReport] = useState<HtpoResultsImportJob | null>(null);
  const [loading, setLoading] = useState(true);

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

  const result = report?.job.result;
  const parsed = result?.parsed ?? 0;
  const imported = result?.imported ?? 0;
  const skipped = result?.skipped ?? 0;

  return (
    <RequireTeacherModule moduleKey="results">
      <div className="htpo-results-report-page">
        <header className="htpo-results-report-head">
          <h1>Import report</h1>
          <p>
            Results are published to the student portal automatically when the import finishes.
            {report?.autoPublished ? ` ${report.publishedCount} row${report.publishedCount === 1 ? "" : "s"} published.` : null}
          </p>
        </header>

        <div className="htpo-results-report-body">
          {loading ? <p className="htpo-results-empty">Loading report…</p> : null}

          {!loading && report ? (
            <>
              <section className="htpo-results-report-section-card">
                <h2>Summary</h2>
                <p>
                  Parsed {parsed} rows · Saved {imported} · Skipped {skipped}
                </p>
              </section>

              <section className="htpo-results-report-section-card">
                <h2>Roll numbers in PDF not found in your sections</h2>
                {report.missingRollNumbersFromPdf.length ? (
                  <>
                    <p>
                      These hall ticket numbers appeared in the uploaded file but do not match any active student in your
                      assigned sections.
                    </p>
                    <ul className="htpo-results-missing-list">
                      {report.missingRollNumbersFromPdf.map((roll) => (
                        <li key={roll}>{roll}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="htpo-results-report-ok">Every roll number in the PDF matched a student in your sections.</p>
                )}
              </section>

              {report.sectionReports.map((section) => (
                <section key={section.sectionId} className="htpo-results-report-section-card">
                  <h2>{section.sectionLabel}</h2>
                  <p>
                    Imported {section.importedCount} of {section.studentCount} students
                  </p>
                  {section.missingFromPdf.length ? (
                    <>
                      <h3>Your section students missing from the PDF</h3>
                      <ul className="htpo-results-missing-list">
                        {section.missingFromPdf.map((student) => (
                          <li key={student.rollNumber}>
                            {student.rollNumber} — {student.fullName}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="htpo-results-report-ok">All students in this section were found in the upload.</p>
                  )}
                </section>
              ))}
            </>
          ) : null}
        </div>

        <footer className="htpo-results-report-footer">
          <button type="button" className="htpo-results-push-btn" onClick={() => void navigate("/teacher/results", { replace: true })}>
            Back to results
          </button>
        </footer>
      </div>
    </RequireTeacherModule>
  );
}

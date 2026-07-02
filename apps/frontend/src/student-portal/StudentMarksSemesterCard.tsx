import type { MarksSemesterBlock } from "./student-marks-types";

function fmtNum(n: number | null) {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : String(n);
}

type Props = {
  semester: MarksSemesterBlock;
  pdfBusy: boolean;
  onDownloadPdf: () => void;
};

export function StudentMarksSemesterCard({ semester, pdfBusy, onDownloadPdf }: Props) {
  const { summary } = semester;

  return (
    <section className="sp-marks-sem" aria-labelledby={`sem-h-${semester.semesterNumber}`}>
      <div className="sp-marks-sem-head">
        <div>
          <h2 id={`sem-h-${semester.semesterNumber}`} className="sp-marks-sem-title">
            Semester {semester.semesterLabel}
          </h2>
          <p className="sp-marks-sem-sub">
            Academic index {semester.semesterNumber}
            {semester.subjects.length ? (
              <> · {semester.subjects.length} subject{semester.subjects.length === 1 ? "" : "s"}</>
            ) : null}
          </p>
        </div>
        <div className="sp-marks-sem-actions">
          <button type="button" className="sp-marks-pdf-btn" disabled={pdfBusy} onClick={onDownloadPdf}>
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="sp-marks-sem-metrics">
        <div className="sp-marks-metric">
          <span className="sp-marks-metric-label">SGPA (JNTUK)</span>
          <strong className="sp-marks-metric-val">{summary.sgpa ?? "—"}</strong>
        </div>
        <div className="sp-marks-metric">
          <span className="sp-marks-metric-label">Credits earned</span>
          <strong className="sp-marks-metric-val">{summary.creditsEarned}</strong>
        </div>
        <div className="sp-marks-metric">
          <span className="sp-marks-metric-label">Credits attempted</span>
          <strong className="sp-marks-metric-val">{summary.creditsAttempted}</strong>
        </div>
        <div className="sp-marks-metric">
          <span className="sp-marks-metric-label">Weighted avg</span>
          <strong className="sp-marks-metric-val">{summary.weightedMarksAvg ?? "—"}</strong>
        </div>
      </div>

      <div className="sp-marks-table-wrap">
        <table className="sp-marks-table">
          <caption className="sr-only">
            {semester.subjects.length
              ? `${semester.subjects.length} subject result${semester.subjects.length === 1 ? "" : "s"} for semester ${semester.semesterLabel}`
              : `No subject results for semester ${semester.semesterLabel}`}
          </caption>
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject</th>
              <th>Internals</th>
              <th>Grade</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {!semester.subjects.length ? (
              <tr>
                <td colSpan={5} className="sp-marks-table-empty">
                  No subject results published for this semester yet.
                </td>
              </tr>
            ) : (
              semester.subjects.map((row) => (
                <tr key={row.id}>
                  <td>{row.subjectCode}</td>
                  <td className="sp-marks-td-subj">{row.subjectName}</td>
                  <td>{fmtNum(row.internals)}</td>
                  <td>{row.grade ?? "—"}</td>
                  <td>{fmtNum(row.credits)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

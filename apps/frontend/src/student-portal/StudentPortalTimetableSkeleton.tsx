/** Matches teacher section timetable grid layout (read-only). */
export function StudentPortalTimetableSkeleton() {
  const dayCount = 7;
  const periodCount = 6;

  return (
    <div className="sp-tt htpo-section-tt-card" aria-busy="true" aria-label="Loading timetable">
      <div className="htpo-section-tt-grid-wrap htpo-tt-table-scroll">
        <table className="htpo-section-tt-grid">
          <thead>
            <tr>
              <th className="htpo-section-tt-time-col" scope="col" />
              {Array.from({ length: dayCount }).map((_, i) => (
                <th key={i} className="htpo-section-tt-day-col">
                  <span className="sp-tt-skel-line sp-tt-skel-line--day" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: periodCount }).map((_, r) => (
              <tr key={r}>
                <th className="htpo-section-tt-time-col">
                  <span className="sp-tt-skel-line sp-tt-skel-line--col" />
                </th>
                {Array.from({ length: dayCount }).map((_, c) => (
                  <td key={c} className="htpo-section-tt-td">
                    <span className="sp-tt-skel-card sp-tt-skel-card--compact" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

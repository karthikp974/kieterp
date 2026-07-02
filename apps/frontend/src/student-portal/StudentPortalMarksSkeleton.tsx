/**
 * Mirrors StudentPortalMarksPage: summary strip, chart panel, semester cards with tables.
 */
export function StudentPortalMarksSkeleton() {
  return (
    <div className="sp-marks" aria-busy="true" aria-label="Loading marks">
      <div className="sp-marks-summary-row">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="sp-marks-summary-card sp-marks-summary-card--skel">
            <span className="sp-marks-skel-line sp-marks-skel-line--tiny" />
            <span className="sp-marks-skel-line sp-marks-skel-line--metric" />
          </div>
        ))}
      </div>

      <div className="sp-marks-chart-grid" aria-hidden>
        {[1, 2].map((i) => (
          <div key={i} className="sp-marks-chart-panel sp-marks-chart-panel--skel">
            <span className="sp-marks-skel-line sp-marks-skel-line--short" />
            <span className="sp-marks-skel-bars" />
          </div>
        ))}
      </div>

      {[1, 2].map((s) => (
        <section key={s} className="sp-marks-sem sp-marks-sem--skel">
          <div className="sp-marks-sem-head">
            <span className="sp-marks-skel-line sp-marks-skel-line--sem-title" />
            <span className="sp-marks-skel-pill" />
          </div>
          <div className="sp-marks-sem-metrics">
            {[1, 2, 3, 4].map((m) => (
              <span key={m} className="sp-marks-skel-metric" />
            ))}
          </div>
          <div className="sp-marks-table-skel">
            <div className="sp-marks-table-skel-row sp-marks-table-skel-row--head">
              {Array.from({ length: 5 }).map((_, c) => (
                <span key={c} className="sp-marks-skel-cell" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, r) => (
              <div key={r} className="sp-marks-table-skel-row">
                {Array.from({ length: 5 }).map((_, c) => (
                  <span key={c} className="sp-marks-skel-cell" />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function StudentMarksChartsSkeleton() {
  return (
    <div className="sp-marks-chart-grid" aria-hidden>
      {[1, 2].map((i) => (
        <div key={i} className="sp-marks-chart-panel sp-marks-chart-panel--skel">
          <span className="sp-marks-skel-line sp-marks-skel-line--short" />
          <span className="sp-marks-skel-bars" />
        </div>
      ))}
    </div>
  );
}

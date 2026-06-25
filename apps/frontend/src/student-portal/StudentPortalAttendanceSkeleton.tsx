/**
 * Chart-area skeleton only (for Suspense around lazy charts).
 */
export function StudentAttendanceChartsSkeleton() {
  return (
    <div className="sp-att-chart-grid" aria-hidden>
      <div className="sp-att-chart-panel sp-att-chart-panel--skel">
        <span className="sp-att-skel-line sp-att-skel-line--short" />
        <span className="sp-att-skel-bars" />
      </div>
    </div>
  );
}

/**
 * Matches StudentPortalAttendancePage: three stat cards, monthly chart, export row, table.
 */
export function StudentPortalAttendanceSkeleton() {
  return (
    <div className="sp-att" aria-busy="true" aria-label="Loading attendance">
      <div className="sp-att-stat-grid">
        {[1, 2, 3].map((k) => (
          <div key={k} className="sp-att-stat-card sp-att-stat-card--skel">
            <span className="sp-att-skel-ring" />
            <span className="sp-att-skel-line sp-att-skel-line--tiny" />
            <span className="sp-att-skel-line sp-att-skel-line--stat" />
            <span className="sp-att-skel-line sp-att-skel-line--stat" />
          </div>
        ))}
      </div>

      <StudentAttendanceChartsSkeleton />

      <div className="sp-att-export-skel">
        <span className="sp-att-skel-line sp-att-skel-line--short" />
        <div className="sp-att-export-skel-row">
          <span className="sp-att-skel-pill" />
          <span className="sp-att-skel-pill" />
          <span className="sp-att-skel-pill" />
        </div>
      </div>

      <div className="sp-att-table-skel">
        <div className="sp-att-table-skel-head">
          {[1, 2, 3, 4, 5].map((c) => (
            <span key={c} className="sp-att-skel-line sp-att-skel-line--cell" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sp-att-table-skel-row">
            {[1, 2, 3, 4, 5].map((c) => (
              <span key={c} className="sp-att-skel-line sp-att-skel-line--cell" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

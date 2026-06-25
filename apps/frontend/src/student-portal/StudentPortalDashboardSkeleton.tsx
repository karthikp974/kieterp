/**
 * Skeleton mirrors dashboard layout: welcome, 2 top cards, today’s classes, quick actions (3×2), announcements.
 */
export function StudentPortalDashboardSkeleton() {
  return (
    <div className="sp-dash" aria-busy="true" aria-label="Loading dashboard">
      <div className="sp-dash-welcome-skel">
        <span className="sp-dash-skel-line sp-dash-skel-line--lg" />
        <span className="sp-dash-skel-line sp-dash-skel-line--sm" />
      </div>

      <div className="sp-dash-top-grid">
        <div className="sp-dash-card-skel">
          <span className="sp-dash-skel-pill" />
          <span className="sp-dash-skel-metric" />
          <span className="sp-dash-skel-hint" />
        </div>
        <div className="sp-dash-card-skel">
          <span className="sp-dash-skel-pill" />
          <span className="sp-dash-skel-metric" />
          <span className="sp-dash-skel-hint" />
        </div>
      </div>

      <div className="sp-dash-section-skel">
        <span className="sp-dash-skel-section-title" />
        <div className="sp-dash-class-rows">
          {[1, 2, 3].map((k) => (
            <div key={k} className="sp-dash-class-row-skel">
              <span className="sp-dash-skel-block sp-dash-skel-time" />
              <span className="sp-dash-skel-block sp-dash-skel-subject" />
            </div>
          ))}
        </div>
      </div>

      <div className="sp-dash-section-skel">
        <span className="sp-dash-skel-section-title" />
        <div className="sp-dash-quick-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="sp-dash-quick-skel" />
          ))}
        </div>
      </div>

      <div className="sp-dash-section-skel">
        <span className="sp-dash-skel-section-title" />
        <div className="sp-dash-announce-grid">
          {[1, 2].map((k) => (
            <div key={k} className="sp-dash-announce-card-skel">
              <span className="sp-dash-skel-line sp-dash-skel-line--md" />
              <span className="sp-dash-skel-line sp-dash-skel-line--full" />
              <span className="sp-dash-skel-line sp-dash-skel-line--full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

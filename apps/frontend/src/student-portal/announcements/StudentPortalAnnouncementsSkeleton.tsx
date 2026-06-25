export function StudentPortalAnnouncementsSkeleton() {
  return (
    <div className="sp-ann" aria-busy="true" aria-label="Loading announcements">
      <header className="sp-ann-head">
        <span className="sp-ann-skel sp-ann-skel--sub" />
      </header>
      <div className="sp-ann-grid">
        {[0, 1, 2, 3].map((i) => (
          <article key={i} className="sp-ann-card sp-ann-card--skel">
            <span className="sp-ann-skel sp-ann-skel--card-title" />
            <span className="sp-ann-skel sp-ann-skel--card-body" />
            <span className="sp-ann-skel sp-ann-skel--card-foot" />
          </article>
        ))}
      </div>
    </div>
  );
}

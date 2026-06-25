export function StudentPortalFeedbackSkeleton() {
  return (
    <div className="sp-fb" aria-busy="true" aria-label="Loading feedback forms">
      <header className="sp-fb-head">
        <span className="sp-fb-skel sp-fb-skel--sub" />
      </header>
      {[0, 1, 2].map((s) => (
        <section key={s} className="sp-fb-section">
          <span className="sp-fb-skel sp-fb-skel--section-title" />
          <div className="sp-fb-grid">
            {[0, 1].map((c) => (
              <article key={c} className="sp-fb-card sp-fb-card--skel">
                <span className="sp-fb-skel sp-fb-skel--card-title" />
                <span className="sp-fb-skel sp-fb-skel--card-line" />
                <span className="sp-fb-skel sp-fb-skel--card-line sp-fb-skel--short" />
                <span className="sp-fb-skel sp-fb-skel--card-btn" />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

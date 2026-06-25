export function StudentPortalFeedbackFormSkeleton() {
  return (
    <div className="sp-fb sp-fb--form" aria-busy="true" aria-label="Loading feedback form">
      <header className="sp-fb-head">
        <span className="sp-fb-skel sp-fb-skel--title" />
        <span className="sp-fb-skel sp-fb-skel--sub" />
      </header>
      <span className="sp-fb-skel sp-fb-skel--desc" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="sp-fb-question sp-fb-question--skel">
          <span className="sp-fb-skel sp-fb-skel--q-prompt" />
          <span className="sp-fb-skel sp-fb-skel--q-input" />
        </div>
      ))}
    </div>
  );
}

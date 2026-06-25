export function StudentPortalProfileSkeleton() {
  return (
    <div className="sp-profile" aria-busy="true" aria-label="Loading profile">
      <header className="sp-profile-head">
        <span className="sp-profile-skel sp-profile-skel--sub" />
      </header>
      <div className="sp-profile-grid">
        <section className="sp-profile-card sp-profile-card--skel">
          <span className="sp-profile-skel sp-profile-skel--card-title" />
          <span className="sp-profile-skel sp-profile-skel--avatar" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="sp-profile-skel sp-profile-skel--field" />
          ))}
        </section>
        <section className="sp-profile-card sp-profile-card--skel">
          <span className="sp-profile-skel sp-profile-skel--card-title" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className="sp-profile-skel sp-profile-skel--field" />
          ))}
        </section>
      </div>
    </div>
  );
}

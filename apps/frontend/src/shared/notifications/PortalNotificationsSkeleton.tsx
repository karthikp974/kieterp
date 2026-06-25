export function PortalNotificationsSkeleton() {
  return (
    <div className="sp-notif" aria-busy="true" aria-label="Loading notifications">
      <header className="sp-notif-head">
        <span className="sp-notif-skel sp-notif-skel--sub" />
      </header>
      <ul className="sp-notif-list">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="sp-notif-item sp-notif-item--skel">
            <span className="sp-notif-skel sp-notif-skel--item-title" />
            <span className="sp-notif-skel sp-notif-skel--item-body" />
            <span className="sp-notif-skel sp-notif-skel--item-meta" />
          </li>
        ))}
      </ul>
    </div>
  );
}

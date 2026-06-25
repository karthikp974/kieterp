export function TeacherPortalRouteSkeleton() {
  return (
    <div className="teacher-portal-skeleton" aria-busy="true" aria-label="Loading">
      <div className="teacher-portal-skeleton-grid">
        <div className="teacher-portal-skel teacher-portal-skel--kpi" />
        <div className="teacher-portal-skel teacher-portal-skel--kpi" />
        <div className="teacher-portal-skel teacher-portal-skel--kpi" />
        <div className="teacher-portal-skel teacher-portal-skel--kpi" />
      </div>
      <div className="teacher-portal-skel teacher-portal-skel--card" />
      <div className="teacher-portal-skel teacher-portal-skel--card" />
    </div>
  );
}

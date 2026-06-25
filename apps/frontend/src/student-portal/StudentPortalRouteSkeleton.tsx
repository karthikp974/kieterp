/**
 * Compact skeleton inside Student Portal chrome during lazy route resolution.
 */
export function StudentPortalRouteSkeleton() {
  return (
    <div className="student-portal-route-skel" aria-busy="true" aria-label="Loading page">
      <span className="student-portal-route-skel-line student-portal-route-skel-line--short" />
      <span className="student-portal-route-skel-line student-portal-route-skel-line--mid" />
      <div className="student-portal-route-skel-grid">
        <span className="student-portal-route-skel-card" />
        <span className="student-portal-route-skel-card" />
      </div>
      <span className="student-portal-route-skel-line student-portal-route-skel-line--full" />
      <span className="student-portal-route-skel-line student-portal-route-skel-line--full" />
    </div>
  );
}

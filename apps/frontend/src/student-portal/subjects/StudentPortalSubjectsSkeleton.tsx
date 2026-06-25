export function StudentPortalSubjectsSkeleton({ showHead = true }: { showHead?: boolean }) {
  return (
    <div className="sp-subj" aria-busy="true" aria-label="Loading subjects">
      {showHead ? (
        <header className="sp-subj-head">
          <span className="sp-subj-skel sp-subj-skel--sub" />
        </header>
      ) : null}
      <div className="sp-subj-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sp-subj-card sp-subj-card--skel">
            <span className="sp-subj-skel sp-subj-skel--name" />
            <span className="sp-subj-skel sp-subj-skel--code" />
            <span className="sp-subj-skel sp-subj-skel--teacher" />
            <span className="sp-subj-skel sp-subj-skel--bar" />
            <span className="sp-subj-skel sp-subj-skel--btn" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentSyllabusModalSkeleton() {
  return (
    <ModalSkel />
  );
}

function ModalSkel() {
  return (
    <div className="sp-subj-modal-skel" aria-busy="true">
      <span className="sp-subj-skel sp-subj-skel--modal-title" />
      <span className="sp-subj-skel sp-subj-skel--bar" />
      {[0, 1].map((i) => (
        <div key={i} className="sp-subj-unit-skel">
          <span className="sp-subj-skel sp-subj-skel--unit-title" />
          <span className="sp-subj-skel sp-subj-skel--topic" />
          <span className="sp-subj-skel sp-subj-skel--topic sp-subj-skel--short" />
        </div>
      ))}
    </div>
  );
}

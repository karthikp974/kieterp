export function StudentAnnouncementDetailSkeleton() {
  return (
    <div className="sp-ann-modal-body sp-ann-modal-body--skel" aria-busy="true">
      <span className="sp-ann-skel sp-ann-skel--meta" />
      <span className="sp-ann-skel sp-ann-skel--badges" />
      <span className="sp-ann-skel sp-ann-skel--line" />
      <span className="sp-ann-skel sp-ann-skel--line" />
      <span className="sp-ann-skel sp-ann-skel--line sp-ann-skel--short" />
    </div>
  );
}

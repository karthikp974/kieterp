export function StudentPortalFeeStatusSkeleton() {
  return (
    <div className="sp-fee" aria-busy="true" aria-label="Loading fee status">
      <div className="sp-fee-summary-card sp-fee-summary-card--skel">
        <div className="sp-fee-summary-top">
          <span className="sp-fee-skel sp-fee-skel--outstanding" />
          <span className="sp-fee-skel sp-fee-skel--btn" />
        </div>
        <div className="sp-fee-summary-rows">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sp-fee-skel sp-fee-skel--row" />
          ))}
        </div>
      </div>
      <div className="sp-fee-details sp-fee-details--skel">
        <span className="sp-fee-skel sp-fee-skel--panel-title" />
        <div className="sp-fee-sem-card sp-fee-panel--skel">
          <span className="sp-fee-skel sp-fee-skel--table" />
        </div>
        <span className="sp-fee-skel sp-fee-skel--panel-title sp-fee-skel--sub" />
        <div className="sp-fee-sem-card sp-fee-panel--skel">
          <span className="sp-fee-skel sp-fee-skel--table sp-fee-skel--table-tall" />
        </div>
      </div>
    </div>
  );
}

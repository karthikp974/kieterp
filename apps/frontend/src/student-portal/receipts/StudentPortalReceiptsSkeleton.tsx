export function StudentPortalReceiptsSkeleton() {
  return (
    <div className="sp-rcpt" aria-busy="true" aria-label="Loading receipts">
      <header className="sp-rcpt-head">
        <span className="sp-rcpt-skel sp-rcpt-skel--sub" />
        <span className="sp-rcpt-skel sp-rcpt-skel--meta" />
      </header>

      {[0, 1].map((s) => (
        <section key={s} className="sp-rcpt-sem sp-rcpt-sem--skel">
          <div className="sp-rcpt-sem-head">
            <span className="sp-rcpt-skel sp-rcpt-skel--sem-title" />
            <span className="sp-rcpt-skel sp-rcpt-skel--sem-sub" />
          </div>
          <div className="sp-rcpt-table-skel">
            <div className="sp-rcpt-table-skel-row sp-rcpt-table-skel-row--head">
              {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                <span key={c} className="sp-rcpt-skel sp-rcpt-skel--cell" />
              ))}
            </div>
            {[0, 1, 2].map((r) => (
              <div key={r} className="sp-rcpt-table-skel-row">
                {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                  <span key={c} className="sp-rcpt-skel sp-rcpt-skel--cell" />
                ))}
              </div>
            ))}
          </div>
          <div className="sp-rcpt-cards-skel">
            {[0, 1].map((c) => (
              <span key={c} className="sp-rcpt-skel sp-rcpt-skel--card" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

import { Download } from "lucide-react";
import { formatInr } from "./format-inr";
import type { FeeBreakdownView } from "./student-fees-types";

type Props = {
  outstandingRupees: number;
  totalFeeRupees: number;
  paidRupees: number;
  pendingRupees: number;
  onDownloadPdf: () => void;
  onOpenBreakdown: (view: FeeBreakdownView) => void;
  pdfLoading?: boolean;
};

export function StudentFeeStatusSummaryCard({
  outstandingRupees,
  totalFeeRupees,
  paidRupees,
  pendingRupees,
  onDownloadPdf,
  onOpenBreakdown,
  pdfLoading
}: Props) {
  const rows: { label: string; amount: number; view: FeeBreakdownView }[] = [
    { label: "Total fee", amount: totalFeeRupees, view: "total" },
    { label: "Paid", amount: paidRupees, view: "paid" },
    { label: "Outstanding", amount: pendingRupees, view: "outstanding" }
  ];

  return (
    <article className="sp-fee-summary-card">
      <SummaryTop outstanding={outstandingRupees} onDownload={onDownloadPdf} pdfLoading={pdfLoading} />
      <dl className="sp-fee-summary-rows">
        {rows.map((row) => (
          <div key={row.label} className="sp-fee-summary-row">
            <div className="sp-fee-summary-row-start">
              <dt>{row.label}</dt>
              <button type="button" className="sp-fee-summary-breakdown" onClick={() => onOpenBreakdown(row.view)}>
                Breakdown
              </button>
            </div>
            <dd>{formatInr(row.amount)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function SummaryTop({
  outstanding,
  onDownload,
  pdfLoading
}: {
  outstanding: number;
  onDownload: () => void;
  pdfLoading?: boolean;
}) {
  return (
    <div className="sp-fee-summary-top">
      <div className="sp-fee-outstanding">
        <p className="sp-fee-outstanding-label">Outstanding balance</p>
        <p className="sp-fee-outstanding-value">{formatInr(outstanding)}</p>
      </div>
      <button type="button" className="sp-fee-download-btn" disabled={pdfLoading} onClick={onDownload}>
        <Download size={16} aria-hidden />
        {pdfLoading ? "Generating…" : "Download"}
      </button>
    </div>
  );
}

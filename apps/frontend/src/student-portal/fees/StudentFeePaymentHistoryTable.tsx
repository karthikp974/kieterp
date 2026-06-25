import { formatInr } from "./format-inr";
import { formatIstLocaleDateTime } from "../../shared/ist-time";
import type { StudentFeePaymentHistoryRow } from "./student-fees-types";
import { StudentReceiptDownloadButton } from "../receipts/StudentReceiptDownloadButton";

function formatPaidAt(iso: string) {
  try {
    return formatIstLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

type Props = {
  rows: StudentFeePaymentHistoryRow[];
};

export function StudentFeePaymentHistoryTable({ rows }: Props) {
  return (
    <section className="sp-fee-panel" aria-labelledby="sp-fee-history-title">
      <h2 id="sp-fee-history-title" className="sp-fee-panel-title">
        Payment history
      </h2>
      <div className="sp-fee-table-scroll sp-fee-table-scroll--tall">
        <table className="sp-fee-table">
          <thead>
            <tr>
              <th>Fee head</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Coverage</th>
              <th>Paid at</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="sp-fee-table-empty">
                  No payments recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="sp-fee-td-head">{row.feeHead}</td>
                  <td>{formatInr(row.amountRupees)}</td>
                  <td>
                    <span className="sp-fee-badge sp-fee-badge--ok">{row.paymentRecordStatus}</span>
                  </td>
                  <td>
                    {row.paidPercentOfFee !== null ? (
                      <span className="sp-fee-coverage">
                        {row.coverageLabel} ({row.paidPercentOfFee}%)
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="sp-fee-td-date">{formatPaidAt(row.paidAt)}</td>
                  <td>
                    {row.canDownloadReceipt ? (
                      <StudentReceiptDownloadButton
                        paymentId={row.id}
                        receiptNo={row.receiptNo}
                        className="sp-fee-receipt-btn"
                        label="PDF"
                      />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

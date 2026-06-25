import { formatInr } from "../fees/format-inr";
import { formatIstLocaleDateTime } from "../../shared/ist-time";
import type { StudentReceiptRow } from "./student-receipts-types";
import { StudentReceiptDownloadButton } from "./StudentReceiptDownloadButton";

function formatPaidAt(iso: string) {
  try {
    return formatIstLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

type Props = {
  rows: StudentReceiptRow[];
  yearLabel: string;
};

export function StudentReceiptRowsTable({ rows, yearLabel }: Props) {
  const sectionId = `sp-rcpt-year-${yearLabel.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <>
      <div className="sp-rcpt-table-scroll" role="region" aria-labelledby={sectionId}>
        <table className="sp-rcpt-table">
          <thead>
            <tr>
              <th>Fee head</th>
              <th>Amount paid</th>
              <th>Mode</th>
              <th>Date</th>
              <th>Status</th>
              <th>Coverage</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="sp-rcpt-table-empty">
                  No receipts in this year.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="sp-rcpt-td-head">{row.feeHead}</td>
                  <td>{formatInr(row.amountRupees)}</td>
                  <td>{row.paymentMode}</td>
                  <td className="sp-rcpt-td-date">{formatPaidAt(row.paidAt)}</td>
                  <td>
                    <span className="sp-rcpt-badge sp-rcpt-badge--ok">{row.paymentRecordStatus}</span>
                  </td>
                  <td>
                    {row.paidPercentOfFee !== null ? (
                      <span className="sp-rcpt-coverage">
                        {row.coverageLabel} ({row.paidPercentOfFee}%)
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <StudentReceiptDownloadButton paymentId={row.id} receiptNo={row.receiptNo} label="PDF" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="sp-rcpt-cards" aria-labelledby={sectionId}>
        {rows.map((row) => (
          <li key={row.id} className="sp-rcpt-card">
            <div className="sp-rcpt-card-head">
              <strong className="sp-rcpt-card-fee">{row.feeHead}</strong>
              <span className="sp-rcpt-badge sp-rcpt-badge--ok">{row.paymentRecordStatus}</span>
            </div>
            <dl className="sp-rcpt-card-grid">
              <div>
                <dt>Amount paid</dt>
                <dd>{formatInr(row.amountRupees)}</dd>
              </div>
              <div>
                <dt>Payment mode</dt>
                <dd>{row.paymentMode}</dd>
              </div>
              <div>
                <dt>Payment date</dt>
                <dd>{formatPaidAt(row.paidAt)}</dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>
                  {row.paidPercentOfFee !== null ? `${row.coverageLabel} (${row.paidPercentOfFee}%)` : "—"}
                </dd>
              </div>
            </dl>
            <StudentReceiptDownloadButton paymentId={row.id} receiptNo={row.receiptNo} />
          </li>
        ))}
      </ul>
    </>
  );
}

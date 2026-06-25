import { useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { formatInr } from "./format-inr";
import type { StudentFeeBreakdownRow, PaymentInitiateResponse } from "./student-fees-types";

type Props = {
  rows: StudentFeeBreakdownRow[];
};

export function StudentFeeBreakdownTable({ rows }: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [payingId, setPayingId] = useState<string | null>(null);

  async function handlePayNow(row: StudentFeeBreakdownRow) {
    if (row.uiStatus !== "PAY_NOW") return;
    setPayingId(row.id);
    try {
      const res = await authFetch("/api/portals/student/fees/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: row.id })
      });
      const payload = (await res.json().catch(() => null)) as PaymentInitiateResponse & { message?: string };
      if (!res.ok) {
        throw new Error(typeof payload?.message === "string" ? payload.message : "Unable to start payment.");
      }
      showToast(payload.message, payload.configured ? "info" : "warning");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to start payment.", "error");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <section className="sp-fee-panel" aria-labelledby="sp-fee-breakdown-title">
      <div className="sp-fee-breakdown-anchors" aria-hidden>
        <span id="sp-fee-breakdown-total" />
        <span id="sp-fee-breakdown-paid" />
        <span id="sp-fee-breakdown-outstanding" />
      </div>
      <h2 id="sp-fee-breakdown-title" className="sp-fee-panel-title">
        Fee structure breakdown
      </h2>
      <div className="sp-fee-table-scroll">
        <table className="sp-fee-table">
          <thead>
            <tr>
              <th>Fee head</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="sp-fee-table-empty">
                  No fee assignments on your account.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="sp-fee-td-head">{row.feeHead}</td>
                  <td>{formatInr(row.amountRupees)}</td>
                  <td>
                    {row.uiStatus === "PAID" ? (
                      <span className="sp-fee-badge sp-fee-badge--paid">Paid</span>
                    ) : (
                      <button
                        type="button"
                        className="sp-fee-pay-btn"
                        disabled={payingId === row.id}
                        onClick={() => void handlePayNow(row)}
                      >
                        {payingId === row.id ? "Preparing…" : "Pay now"}
                      </button>
                    )}
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

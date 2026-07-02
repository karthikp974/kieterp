import { FileDown } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { formatInr } from "./format-inr";
import { parseReceiptFilename, RECEIPT_PDF_PATH } from "../receipts/receipt-download";
import type { FeeBreakdownView, PaymentInitiateResponse, StudentFeeAssignmentItem } from "./student-fees-types";
import { ASSIGNMENT_RECEIPT_PDF_PATH } from "./student-fees-types";

type Props = {
  item: StudentFeeAssignmentItem;
  view: FeeBreakdownView;
};

function badgeFor(item: Pick<StudentFeeAssignmentItem, "status" | "feeStatus" | "daysOverdue">) {
  if (item.status === "PAID") {
    return { className: "sp-fee-badge sp-fee-badge--paid", label: "Paid" };
  }
  if (item.feeStatus === "overdue") {
    const days = item.daysOverdue ?? 0;
    return {
      className: "sp-fee-badge sp-fee-badge--overdue",
      label: days > 0 ? `Overdue by ${days} day${days === 1 ? "" : "s"}` : "Overdue"
    };
  }
  if (item.status === "PARTIAL") {
    return { className: "sp-fee-badge sp-fee-badge--partial", label: "Partial" };
  }
  return { className: "sp-fee-badge sp-fee-badge--pending", label: "Pending" };
}

export function StudentFeeBreakdownRowActions({ item, view }: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<"pay" | "pdf" | null>(null);

  const showPay =
    item.canPay &&
    (view === "total"
      ? item.status !== "PAID"
      : view === "outstanding" || (view === "paid" && item.status === "PARTIAL"));
  const showPdf =
    item.canDownloadReceipt &&
    (view === "total"
      ? item.status === "PAID" || item.status === "PARTIAL"
      : view === "paid"
        ? item.status === "PAID" || item.status === "PARTIAL"
        : item.status === "PARTIAL");

  async function handlePayNow() {
    setBusy("pay");
    try {
      const res = await authFetch("/api/portals/student/fees/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: item.id })
      });
      const payload = (await res.json().catch(() => null)) as PaymentInitiateResponse & { message?: string };
      if (!res.ok) {
        throw new Error(typeof payload?.message === "string" ? payload.message : "Unable to start payment.");
      }
      showToast(payload.message, payload.configured ? "info" : "warning");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to start payment.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadPdf() {
    setBusy("pdf");
    try {
      const useAssignmentReceipt = item.status === "PARTIAL" || view !== "total";
      const path = useAssignmentReceipt
        ? ASSIGNMENT_RECEIPT_PDF_PATH(item.id)
        : item.latestPaymentId
          ? RECEIPT_PDF_PATH(item.latestPaymentId)
          : ASSIGNMENT_RECEIPT_PDF_PATH(item.id);
      const res = await authFetch(path);
      if (!res.ok) {
        showToast("Could not download receipt PDF.", "error");
        return;
      }
      const blob = await res.blob();
      const fallback = `receipt-${item.feeHead.replace(/[^\w.-]+/g, "_")}.pdf`;
      const fn = parseReceiptFilename(res.headers.get("Content-Disposition"), fallback);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fn;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Download started.", "success");
    } catch {
      showToast("Could not download receipt PDF.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (!showPay && !showPdf) {
    return <span className="sp-fee-action-muted">—</span>;
  }

  return (
    <div className="sp-fee-action-group">
      {showPdf ? (
        <button
          type="button"
          className="sp-fee-pdf-btn"
          aria-label={`Download PDF for ${item.feeHead}`}
          disabled={busy !== null}
          onClick={() => void handleDownloadPdf()}
        >
          <FileDown size={16} aria-hidden />
          {busy === "pdf" ? "…" : "PDF"}
        </button>
      ) : null}
      {showPay ? (
        <button type="button" className="sp-fee-pay-btn" disabled={busy !== null} onClick={() => void handlePayNow()}>
          {busy === "pay" ? "Preparing…" : "Pay now"}
        </button>
      ) : null}
    </div>
  );
}

export function StudentFeeBreakdownStatusBadge({ item }: { item: StudentFeeAssignmentItem }) {
  const badge = badgeFor(item);
  return <span className={badge.className}>{badge.label}</span>;
}

export function StudentFeeBreakdownAmount({ item }: { item: StudentFeeAssignmentItem }) {
  return (
    <span className="sp-fee-amount-cell">
      {formatInr(item.amountRupees)}
      {item.status === "PARTIAL" ? (
        <span className="sp-fee-amount-sub">
          Paid {formatInr(item.paidRupees)} · Due {formatInr(item.balanceRupees)}
        </span>
      ) : null}
    </span>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ErpLoader } from "../shared/ErpLoader";
import { useToast } from "../shared/toast-context";
import type { FeeCollectionDayPayment } from "./admin-fee-collection.util";
import { formatFeeInr, readApiError } from "./admin-fee-collection.util";

type DayPaymentsResponse = {
  paymentDate: string;
  totalCollected: number;
  paymentCount: number;
  payments: FeeCollectionDayPayment[];
};

export function AdminFeeCollectionDayPage() {
  const { date = "" } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Pick<DayPaymentsResponse, "paymentDate" | "totalCollected" | "paymentCount"> | null>(null);
  const [payments, setPayments] = useState<FeeCollectionDayPayment[]>([]);

  const loadDay = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showToast("Invalid payment date.", "error");
      void navigate("/admin/fees/collected", { replace: true });
      return;
    }

    setLoading(true);
    try {
      const response = await authFetch(`/api/portals/admin/dashboard/fee-collection/days/${date}`);
      if (!response.ok) throw await readApiError(response, "Unable to load payments for this date.");
      const data = (await response.json()) as DayPaymentsResponse;
      setSummary({
        paymentDate: data.paymentDate,
        totalCollected: data.totalCollected,
        paymentCount: data.paymentCount
      });
      setPayments(data.payments);
    } catch (error) {
      setSummary(null);
      setPayments([]);
      showToast(error instanceof Error ? error.message : "Unable to load payments for this date.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, date, navigate, showToast]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  return (
    <div className="admin-dashboard">
      <section className="admin-panel">
        {summary ? (
          <p className="admin-fee-collection-note">
            {summary.paymentCount} payment{summary.paymentCount === 1 ? "" : "s"} · {formatFeeInr(summary.totalCollected)} collected
          </p>
        ) : null}

        {loading ? (
          <div className="admin-fee-collection-loading">
            <ErpLoader />
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roll number</th>
                  <th>Batch year</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No payments recorded for this date.</td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.studentName}</td>
                      <td>{payment.rollNumber}</td>
                      <td>{payment.batchYear}</td>
                      <td>{payment.classLabel}</td>
                      <td>{payment.sectionName}</td>
                      <td>{formatFeeInr(payment.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

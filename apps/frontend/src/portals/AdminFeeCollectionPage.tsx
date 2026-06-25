import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ErpLoader } from "../shared/ErpLoader";
import { useToast } from "../shared/toast-context";
import type { FeeCollectionDayRow } from "./admin-fee-collection.util";
import { formatFeeDisplayDate, formatFeeInr, readApiError } from "./admin-fee-collection.util";

type DailyBreakdownResponse = {
  today: string;
  days: FeeCollectionDayRow[];
  totalCollected: number;
  totalPayments: number;
};

export function AdminFeeCollectionPage() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<FeeCollectionDayRow[]>([]);

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/portals/admin/dashboard/fee-collection/daily");
      if (!response.ok) throw await readApiError(response, "Unable to load fee collection breakdown.");
      const data = (await response.json()) as DailyBreakdownResponse;
      setDays(data.days);
    } catch (error) {
      setDays([]);
      showToast(error instanceof Error ? error.message : "Unable to load fee collection breakdown.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void loadBreakdown();
  }, [loadBreakdown]);

  return (
    <div className="admin-dashboard">
      <section className="admin-panel">
        {loading ? (
          <div className="admin-fee-collection-loading">
            <ErpLoader />
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-fee-collection-table">
              <thead>
                <tr>
                  <th>Payment date</th>
                  <th>Collected</th>
                  <th>Payments</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {days.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No fee payments recorded yet.</td>
                  </tr>
                ) : (
                  days.map((day) => (
                    <tr key={day.paymentDate}>
                      <td>{formatFeeDisplayDate(day.paymentDate)}</td>
                      <td>{formatFeeInr(day.collectedAmount)}</td>
                      <td>{day.paymentCount}</td>
                      <td className="admin-fee-collection-action">
                        <button
                          type="button"
                          className="admin-fee-breakdown-btn"
                          onClick={() => navigate(`/admin/fees/collected/${day.paymentDate}`)}
                        >
                          View
                        </button>
                      </td>
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

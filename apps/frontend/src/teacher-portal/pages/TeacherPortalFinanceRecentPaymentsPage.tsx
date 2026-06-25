import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { financeStatusLabel } from "../htpo-finance-export";
import type { HtpoFinanceRecentPaymentRow } from "../htpo-finance-types";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

const PAGE_SIZE = 15;

function StatusBadge({ status }: { status: string }) {
  return <span className={`htpo-finance-status htpo-finance-status--${status}`}>{financeStatusLabel(status)}</span>;
}

function RecentPaymentsContent() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sectionId = searchParams.get("sectionId") ?? "";

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HtpoFinanceRecentPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (sectionId) params.set("sectionId", sectionId);
    return params.toString();
  }, [page, sectionId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/finance/recent-payments?${query}`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load recent payments."));
      const data = (await res.json()) as { items: HtpoFinanceRecentPaymentRow[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Load failed.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, query, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="htpo-finance-subpage">
      <header className="htpo-finance-subhead">
        <div>
          <h1>Recent payments</h1>
          <p>Latest fee payments in your scope.</p>
        </div>
        <button type="button" className="htpo-finance-back-btn" onClick={() => navigate("/teacher/finance")}>
          Back to finance
        </button>
      </header>

      {loading ? <p className="htpo-finance-loading">Loading…</p> : null}

      <div className="htpo-finance-table-wrap">
        <table className="htpo-finance-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Roll number</th>
              <th>Section</th>
              <th>Fee type</th>
              <th>Fee paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td className="htpo-finance-name">{row.fullName}</td>
                <td>
                  <span className="htpo-finance-roll">{row.rollNumber}</span>
                </td>
                <td className="htpo-finance-section">{row.sectionLabel}</td>
                <td>{row.feeType}</td>
                <td>{row.feePaidDisplay}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !items.length ? <p className="htpo-finance-empty">No payments recorded yet.</p> : null}
      </div>

      {total > PAGE_SIZE ? (
        <div className="htpo-finance-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {maxPage}
          </span>
          <button type="button" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TeacherPortalFinanceRecentPaymentsPage() {
  return (
    <RequireTeacherModule moduleKey="finance">
      <TeacherPortalModuleShell>
        <TeacherPortalPanelWrap>
          <RecentPaymentsContent />
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

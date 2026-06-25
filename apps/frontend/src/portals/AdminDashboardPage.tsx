import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ErpLoader } from "../shared/ErpLoader";
import { IST_TIMEZONE } from "../shared/ist-time";
import { formatDashboardFeeCompact } from "./admin-fee-collection.util";

type DashboardSummary = {
  stats: { students: number; teachers: number; feeCollected: number; feePending: number };
  branchStats: { code: string; label: string; count: number }[];
  recentPayments: { id: string; student: string; amount: number; feeHead: string; paidAt: string; status: string }[];
};

/** Always show these four rows with bars (even when counts are 0). */
const DEPARTMENT_BAR_ROWS: { code: string; label: string; count: number }[] = [
  { code: "BTECH", label: "B.Tech", count: 0 },
  { code: "MTECH", label: "M.Tech", count: 0 },
  { code: "DIPLOMA", label: "Diploma", count: 0 },
  { code: "PG", label: "PG", count: 0 }
];

const quickActions = [
  { label: "+ Add student", path: "/students/add-student", tone: "primary" },
  { label: "+ Add teacher", path: "/teachers/add-teacher", tone: "primary" },
  { label: "Record payment", path: "/payments/register", tone: "success", backHref: "/admin" },
  { label: "Promote students", path: "/promotion/promote-students", tone: "warning" }
] as const;

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST_TIMEZONE });
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void authFetch("/api/portals/admin/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load dashboard.");
        return (await res.json()) as DashboardSummary;
      })
      .then((json) => {
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch]);

  if (loading) {
    return (
      <div className="admin-dashboard admin-dashboard-loading">
        <ErpLoader />
      </div>
    );
  }

  const stats = data?.stats ?? { students: 0, teachers: 0, feeCollected: 0, feePending: 0 };
  const apiBranches = data?.branchStats?.length ? data.branchStats : null;
  const branchStats = apiBranches
    ? DEPARTMENT_BAR_ROWS.map((row) => {
        const fromApi = apiBranches.find((b) => b.code === row.code);
        return fromApi ? { ...row, count: fromApi.count } : row;
      })
    : DEPARTMENT_BAR_ROWS;
  const recentPayments = data?.recentPayments ?? [];
  const maxBranch = Math.max(...branchStats.map((b) => b.count), 1);

  const statCards = [
    ["Students", String(stats.students), "Enrolled", "border-emerald-500", false],
    ["Teachers", String(stats.teachers), "Faculty members", "border-cyan-500", false],
    ["Fee Collected", formatDashboardFeeCompact(stats.feeCollected), "Collected today", "border-blue-500", true],
    ["Fee Pending", String(stats.feePending), "Unpaid assignments", "border-rose-500", false]
  ] as const;

  return (
    <div className="admin-dashboard">
      <div className="admin-stat-grid">
        {statCards.map(([title, value, caption, border, clickable]) =>
          clickable ? (
            <button
              key={title}
              type="button"
              className={`admin-stat-card admin-stat-card--clickable ${border}`}
              onClick={() => navigate("/admin/fees/collected")}
            >
              <p className="admin-stat-title">{title}</p>
              <p className="admin-stat-value">{value}</p>
              <p className="admin-stat-caption">{caption}</p>
            </button>
          ) : (
            <section key={title} className={`admin-stat-card ${border}`}>
              <p className="admin-stat-title">{title}</p>
              <p className="admin-stat-value">{value}</p>
              <p className="admin-stat-caption">{caption}</p>
            </section>
          )
        )}
      </div>

      <div className="admin-middle-grid">
        <section className="admin-panel">
          <h2 className="admin-panel-title">Students per department</h2>
          <div className="admin-branch-list">
            {branchStats.map((branch) => (
              <div key={branch.code} className="admin-branch-row">
                <span className="admin-branch-name">{branch.label}</span>
                <div className="admin-progress-track">
                  <div
                    className="admin-progress-fill"
                    style={{
                      width: `${branch.count > 0 ? Math.max(10, Math.round((branch.count / maxBranch) * 100)) : 0}%`
                    }}
                  />
                </div>
                <span className="admin-branch-count">{branch.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <h2 className="admin-panel-title">Quick actions</h2>
          <div className="admin-actions-grid">
            {quickActions.map((action) => (
              <button
                key={action.path}
                type="button"
                className={`admin-action-btn${action.tone ? ` ${action.tone}` : ""}`}
                onClick={() =>
                  navigate(action.path, "backHref" in action && action.backHref ? { state: { backHref: action.backHref } } : undefined)
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Recent payments</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Fee head</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={5}>No payments recorded yet.</td>
                </tr>
              ) : (
                recentPayments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.student}</td>
                    <td>{formatInr(row.amount)}</td>
                    <td>{row.feeHead}</td>
                    <td>{formatDate(row.paidAt)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

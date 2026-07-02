import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { FormSelect, type FormSelectOption } from "../../shared/FormSelect";
import { readApiError } from "../../shared/read-api-error";
import { toFormSelectOptions, withEmptyOption } from "../../shared/select-options";
import { useToast } from "../../shared/toast-context";
import { downloadFinanceExport, financeStatusLabel } from "../htpo-finance-export";
import type {
  FeeUiStatusFilter,
  FinanceExportFormat,
  HtpoFinancePaymentStatusItem,
  HtpoFinanceSectionCollectionItem,
  HtpoFinanceSetup,
  HtpoFinanceStudentRow,
  HtpoFinanceStudentsResponse,
  HtpoFinanceSummary
} from "../htpo-finance-types";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

const STUDENTS_PAGE_SIZE = 8;

const STATUS_FILTER_OPTIONS: readonly [string, string][] = [
  ["all", "All statuses"],
  ["overdue", "Overdue only"],
  ["paid", "Paid"],
  ["partial", "Partial"],
  ["pending", "Pending"]
];

function FinancePager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="htpo-finance-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {maxPage}
      </span>
      <button type="button" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

function StudentStatusBadge({ row }: { row: HtpoFinanceStudentRow }) {
  if (row.feeStatus === "overdue") {
    const days = row.daysOverdue ?? 0;
    return (
      <span className="htpo-finance-status htpo-finance-status--overdue">
        {days > 0 ? `Overdue by ${days} day${days === 1 ? "" : "s"}` : "Overdue"}
      </span>
    );
  }
  return <span className={`htpo-finance-status htpo-finance-status--${row.status}`}>{financeStatusLabel(row.status)}</span>;
}

function FinanceExportDialog({
  open,
  sectionLabel,
  statusLabel,
  onClose,
  onExport
}: {
  open: boolean;
  sectionLabel: string;
  statusLabel: string;
  onClose: () => void;
  onExport: (format: FinanceExportFormat) => Promise<void>;
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  if (!open) return null;

  const formats = [
    { id: "docx", label: "Word" },
    { id: "excel", label: "Excel" },
    { id: "google-sheets", label: "Google Sheets" },
    { id: "txt", label: "TXT" },
    { id: "pdf", label: "PDF" }
  ] as const;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog"
        aria-modal="true"
        role="dialog"
        aria-labelledby="finance-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="finance-export-title">Export student fees</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="erp-export-dialog-lead">
          Export <strong>{sectionLabel}</strong> · <strong>{statusLabel}</strong>
        </p>
        <div className="erp-export-dialog-options">
          {formats.map((format) => (
            <button
              key={format.id}
              type="button"
              className="erp-export-option"
              disabled={Boolean(exporting)}
              onClick={() => {
                setExporting(format.id);
                void onExport(format.id).finally(() => setExporting(null));
              }}
            >
              {exporting === format.id ? "Downloading…" : format.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryGrid({
  summary,
  onTotalFees,
  onPending
}: {
  summary: HtpoFinanceSummary;
  onTotalFees: () => void;
  onPending: () => void;
}) {
  return (
    <div className="htpo-finance-summary-grid">
      <button type="button" className="htpo-finance-stat htpo-finance-stat--clickable" onClick={onTotalFees}>
        <span className="htpo-finance-stat-label">Total fees</span>
        <strong className="htpo-finance-stat-value">{summary.totalFees.display}</strong>
        <small>{summary.totalFees.label}</small>
      </button>
      <article className="htpo-finance-stat">
        <span className="htpo-finance-stat-label">Collected</span>
        <strong className="htpo-finance-stat-value">{summary.collected.display}</strong>
        <small>{summary.collected.collectionRate}% rate</small>
      </article>
      <button type="button" className="htpo-finance-stat htpo-finance-stat--clickable" onClick={onPending}>
        <span className="htpo-finance-stat-label">Pending</span>
        <strong className="htpo-finance-stat-value">{summary.pending.display}</strong>
        <small>{summary.pending.hint}</small>
      </button>
      <article className="htpo-finance-stat">
        <span className="htpo-finance-stat-label">Sections</span>
        <strong className="htpo-finance-stat-value">{summary.sections.count}</strong>
        <small>{summary.sections.hint}</small>
      </article>
    </div>
  );
}

function StudentFeeTable({
  rows,
  remindingId,
  onRemind
}: {
  rows: HtpoFinanceStudentRow[];
  remindingId: string | null;
  onRemind: (row: HtpoFinanceStudentRow) => void;
}) {
  if (!rows.length) {
    return <p className="htpo-finance-empty">No students match the selected filters.</p>;
  }

  return (
    <div className="htpo-finance-table-wrap">
      <table className="htpo-finance-table">
        <thead>
          <tr>
            <th>Roll no</th>
            <th>Name</th>
            <th>Section</th>
            <th>Total fee</th>
            <th>Paid</th>
            <th>Balance</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentProfileId} className={row.feeStatus === "overdue" ? "htpo-finance-row--overdue" : undefined}>
              <td>
                <span className="htpo-finance-roll">{row.rollNumber}</span>
              </td>
              <td className="htpo-finance-name">{row.fullName}</td>
              <td className="htpo-finance-section">{row.sectionLabel}</td>
              <td>{row.totalFeeDisplay}</td>
              <td>{row.paidDisplay}</td>
              <td>{row.balanceDisplay}</td>
              <td>
                <StudentStatusBadge row={row} />
              </td>
              <td>
                {row.canRemind ? (
                  <button
                    type="button"
                    className="htpo-finance-remind-btn"
                    disabled={remindingId === row.studentProfileId}
                    onClick={() => onRemind(row)}
                  >
                    {remindingId === row.studentProfileId ? "Sending…" : "Remind"}
                  </button>
                ) : (
                  <span className="htpo-finance-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCollectionCard({ items }: { items: HtpoFinanceSectionCollectionItem[] }) {
  if (!items.length) return null;
  return (
    <article className="htpo-finance-card">
      <h2 className="htpo-finance-card-title">Section-wise collection</h2>
      <ul className="htpo-finance-collection-list">
        {items.map((item) => (
          <li key={item.sectionId} className="htpo-finance-collection-row">
            <div className="htpo-finance-collection-head">
              <span>{item.label}</span>
              <strong>{item.percent}%</strong>
            </div>
            <div className="htpo-finance-progress" aria-hidden>
              <span style={{ width: `${item.percent}%` }} />
            </div>
            <small>
              {item.collectedDisplay} of {item.targetDisplay}
            </small>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PaymentStatusCard({ items, totalStudents }: { items: HtpoFinancePaymentStatusItem[]; totalStudents: number }) {
  return (
    <article className="htpo-finance-card">
      <h2 className="htpo-finance-card-title">Payment status</h2>
      <ul className="htpo-finance-payment-status-list">
        {items.map((item) => (
          <li key={item.status} className="htpo-finance-payment-status-row">
            <div className="htpo-finance-collection-head">
              <span>{item.label}</span>
              <strong>
                {item.studentCount} student{item.studentCount === 1 ? "" : "s"} · {item.percent}%
              </strong>
            </div>
            <div className="htpo-finance-progress" aria-hidden>
              <span style={{ width: `${item.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {totalStudents === 0 ? <p className="htpo-finance-empty">No fee assignments in scope yet.</p> : null}
    </article>
  );
}

function FinancePageContent() {
  const { authFetch, accessToken } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [setup, setSetup] = useState<HtpoFinanceSetup | null>(null);
  const [summary, setSummary] = useState<HtpoFinanceSummary | null>(null);
  const [students, setStudents] = useState<HtpoFinanceStudentsResponse | null>(null);
  const [sectionCollection, setSectionCollection] = useState<HtpoFinanceSectionCollectionItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<{ items: HtpoFinancePaymentStatusItem[]; totalStudents: number } | null>(null);

  const [tableSectionId, setTableSectionId] = useState("");
  const [statusFilter, setStatusFilter] = useState<FeeUiStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const fixedSectionId = setup?.fixedSectionId ?? setup?.sections[0]?.id ?? "";

  const scopeParams = useMemo(() => {
    const params = new URLSearchParams();
    if (!setup?.showSectionFilter && fixedSectionId) params.set("sectionId", fixedSectionId);
    return params;
  }, [fixedSectionId, setup?.showSectionFilter]);

  const loadSetup = useCallback(async () => {
    const res = await authFetch("/api/portals/teacher/finance/setup");
    if (!res.ok) throw new Error(await readApiError(res, "Could not load finance setup."));
    return (await res.json()) as HtpoFinanceSetup;
  }, [authFetch]);

  const loadDashboard = useCallback(async () => {
    const query = scopeParams.toString();
    const suffix = query ? `?${query}` : "";
    const tableSection = setup?.showSectionFilter ? tableSectionId : fixedSectionId;
    const studentParams = new URLSearchParams({
      status: statusFilter,
      page: String(page),
      pageSize: String(STUDENTS_PAGE_SIZE)
    });
    if (tableSection) studentParams.set("sectionId", tableSection);
    if (search.trim()) studentParams.set("search", search.trim());

    const [summaryRes, studentsRes, paymentRes] = await Promise.all([
      authFetch(`/api/portals/teacher/finance/summary${suffix}`),
      authFetch(`/api/portals/teacher/finance/students?${studentParams.toString()}`),
      authFetch(`/api/portals/teacher/finance/payment-status${suffix}`)
    ]);

    if (!summaryRes.ok) throw new Error(await readApiError(summaryRes, "Could not load finance summary."));
    if (!studentsRes.ok) throw new Error(await readApiError(studentsRes, "Could not load student fees."));
    if (!paymentRes.ok) throw new Error(await readApiError(paymentRes, "Could not load payment status."));

    setSummary((await summaryRes.json()) as HtpoFinanceSummary);
    setStudents((await studentsRes.json()) as HtpoFinanceStudentsResponse);
    setPaymentStatus(await paymentRes.json());
  }, [authFetch, fixedSectionId, page, scopeParams, search, setup?.showSectionFilter, statusFilter, tableSectionId]);

  const loadSectionCollection = useCallback(async () => {
    if (!setup?.showSectionCollection) {
      setSectionCollection([]);
      return;
    }
    const query = scopeParams.toString();
    const res = await authFetch(`/api/portals/teacher/finance/section-collection${query ? `?${query}` : ""}`);
    if (!res.ok) throw new Error(await readApiError(res, "Could not load section collection."));
    const data = (await res.json()) as { items: HtpoFinanceSectionCollectionItem[] };
    setSectionCollection(data.items);
  }, [authFetch, scopeParams, setup?.showSectionCollection]);

  useEffect(() => {
    setLoading(true);
    loadSetup()
      .then((data) => setSetup(data))
      .catch((error) => showToast(error instanceof Error ? error.message : "Finance setup failed.", "error"))
      .finally(() => setLoading(false));
  }, [loadSetup, showToast]);

  useEffect(() => {
    if (!setup) return;
    setLoading(true);
    Promise.all([loadDashboard(), loadSectionCollection()])
      .catch((error) => showToast(error instanceof Error ? error.message : "Finance data failed.", "error"))
      .finally(() => setLoading(false));
  }, [loadDashboard, loadSectionCollection, setup]);

  useEffect(() => {
    setPage(1);
  }, [tableSectionId, statusFilter, search]);

  const tableSectionOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All sections"]];
    for (const section of setup?.sections ?? []) {
      rows.push([section.id, section.label]);
    }
    return rows;
  }, [setup?.sections]);

  const exportSectionLabel =
    tableSectionId && setup?.sections.find((s) => s.id === tableSectionId)?.label
      ? setup.sections.find((s) => s.id === tableSectionId)!.label
      : "All sections";

  async function handleRemind(row: HtpoFinanceStudentRow) {
    setRemindingId(row.studentProfileId);
    try {
      const res = await authFetch(`/api/portals/teacher/finance/students/${row.studentProfileId}/remind`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not send reminder."));
      showToast(`Reminder sent to ${row.fullName}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Reminder failed.", "error");
    } finally {
      setRemindingId(null);
    }
  }

  const scopeQuerySection = setup?.showSectionFilter ? tableSectionId : fixedSectionId;
  const recentPaymentsQuery = scopeQuerySection ? `?sectionId=${encodeURIComponent(scopeQuerySection)}` : "";
  const pendingQuery = scopeQuerySection ? `?sectionId=${encodeURIComponent(scopeQuerySection)}` : "";

  return (
    <div className="htpo-finance-page">
      {loading && !summary ? <p className="htpo-finance-loading">Loading finance…</p> : null}

      {summary ? (
        <SummaryGrid
          summary={summary}
          onTotalFees={() => navigate(`/teacher/finance/recent-payments${recentPaymentsQuery}`)}
          onPending={() => navigate(`/teacher/finance/pending${pendingQuery}`)}
        />
      ) : null}

      <article className="htpo-finance-card htpo-finance-card--table">
        <div className="htpo-finance-card-toolbar">
          <h2 className="htpo-finance-card-title">Student fee status</h2>
          <div className="htpo-finance-toolbar-filters">
            <input
              type="search"
              className="htpo-finance-search"
              placeholder="Search roll no or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students by roll number or name"
            />
            {setup?.showSectionFilter ? (
              <FormSelect
                value={tableSectionId}
                options={tableSectionOptions}
                onChange={setTableSectionId}
                aria-label="Filter table by section"
              />
            ) : null}
            <FormSelect value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={(v) => setStatusFilter(v as FeeUiStatusFilter)} aria-label="Filter by status" />
          </div>
        </div>
        <button type="button" className="htpo-finance-export-btn" onClick={() => setExportOpen(true)}>
          Export
        </button>
        <StudentFeeTable rows={students?.items ?? []} remindingId={remindingId} onRemind={handleRemind} />
        {students ? (
          <FinancePager page={students.page} total={students.total} pageSize={students.pageSize} onPage={setPage} />
        ) : null}
      </article>

      <div className="htpo-finance-side-grid">
        {setup?.showSectionCollection ? <SectionCollectionCard items={sectionCollection} /> : null}
        {paymentStatus ? <PaymentStatusCard items={paymentStatus.items} totalStudents={paymentStatus.totalStudents} /> : null}
      </div>

      <FinanceExportDialog
        open={exportOpen}
        sectionLabel={exportSectionLabel}
        statusLabel={financeStatusLabel(statusFilter)}
        onClose={() => setExportOpen(false)}
        onExport={async (format) => {
          if (!accessToken) {
            showToast("Sign in again to export.", "error");
            return;
          }
          try {
            downloadFinanceExport(accessToken, {
              sectionId: (setup?.showSectionFilter ? tableSectionId : fixedSectionId) || undefined,
              status: statusFilter,
              format
            });
            showToast("Export started — check your downloads.");
            setExportOpen(false);
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Export failed.", "error");
            throw error;
          }
        }}
      />
    </div>
  );
}

export function TeacherPortalFinancePage() {
  return (
    <RequireTeacherModule moduleKey="finance">
      <TeacherPortalModuleShell>
        <TeacherPortalPanelWrap>
          <FinancePageContent />
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

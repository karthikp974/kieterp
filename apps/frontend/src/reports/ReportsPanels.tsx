import { ArrowLeft } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ErpLoader } from "../shared/ErpLoader";
import { ExportFormatDialog, ExportTriggerButton } from "../shared/export";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { AdminWorkflowMenuButton } from "../shared/OptionPage";
import { useToast } from "../shared/toast-context";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { WfBtn } from "../shared/WfBtn";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { formatIstLocaleDate } from "../shared/ist-time";
import {
  currencyInr,
  defaultReportFilters,
  describeReportScope,
  downloadReportExport,
  filtersToQuery,
  presetFilters,
  type ReportExportFormat,
  type ReportFilters
} from "./reports-utils";
import { ReportsDashboard } from "./ReportsDashboard";

type ReportMode = "admin" | "teacher";
type ReportTab = "overview" | "attendance" | "finance" | "results";

type ReportsSummary = {
  scope?: ReportFilters;
  students: { active: number };
  attendance: { sessions: number; present: number; absent: number; percentage: number };
  finance: { collected: number; payments: number };
  results: { totalEntries: number; failedOrAbsent: number };
  applications: { pending: number };
};

type AttendanceReportRow = {
  id: string;
  date: string;
  section: string;
  subject: string;
  total: number;
  present: number;
  absent: number;
  percentage: number;
};

type FinanceReport = {
  summary: { collected: number; payments: number };
  byHead: { feeHead: string; amount: number; count: number }[];
  recent?: { id: string; receiptNo: string; student: string; feeHead: string; amount: number; paidAt: string }[];
};

type ResultsReport = {
  summary: { totalEntries: number; PASS: number; FAIL: number; ABSENT: number; WITHHELD: number };
  recentFailures: { id: string; rollNumber: string; student: string; subject: string; grade?: string | null; status: string }[];
};

type TeacherReportAssignment = { id: string; role: string; scopeLabel: string; section?: { id: string; name: string } | null };

type CatalogState = {
  campuses: Campus[];
  programs: Program[];
  branches: Branch[];
  batches: Batch[];
  classes: AcademicClass[];
  sections: Section[];
};

const emptyCatalog: CatalogState = { campuses: [], programs: [], branches: [], batches: [], classes: [], sections: [] };

function useApi() {
  const { authFetch } = useAuth();
  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? `Request failed: ${path}`);
    }
    return (await response.json()) as T;
  }
  return { authFetch, fetchJson };
}

const REPORT_EXPORT_BY_TAB: Record<ReportTab, { apiPath: string; label: string }> = {
  overview: { apiPath: "/api/reports/summary/export", label: "Overview" },
  attendance: { apiPath: "/api/reports/attendance/export", label: "Attendance" },
  finance: { apiPath: "/api/reports/finance/export", label: "Finance" },
  results: { apiPath: "/api/reports/results/export", label: "Results" }
};

function ReportsShell({
  children,
  title,
  variant = "subpage",
  backHref
}: {
  children: ReactNode;
  title: string;
  variant?: "main" | "subpage";
  backHref?: string;
}) {
  const navigate = useNavigate();

  return (
    <main className="db-workflow ann-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? (
            <AdminWorkflowMenuButton />
          ) : backHref ? (
            <Link to={backHref} className="db-icon-button" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" className="db-icon-button" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <section className="db-workflow-body ann-workflow-body">{children}</section>
    </main>
  );
}

export function ReportsHomePage() {
  return (
    <ReportsShell title="Reports" variant="main">
      <ReportsDashboard mode="admin" />
    </ReportsShell>
  );
}

export function AdminReportsPanel() {
  return <ReportsPanel mode="admin" />;
}

export function TeacherReportsPanel() {
  return <ReportsPanel mode="teacher" showHeader title="My scope reports" description="Summaries and exports for sections you are assigned to." />;
}

function ReportsPanel({
  mode,
  showHeader = false,
  title = "",
  description = ""
}: {
  mode: ReportMode;
  showHeader?: boolean;
  title?: string;
  description?: string;
}) {
  const { authFetch, fetchJson } = useApi();
  const { showToast } = useToast();
  const [tab, setTab] = useState<ReportTab>("overview");
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>(defaultReportFilters);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalog);
  const [assignments, setAssignments] = useState<TeacherReportAssignment[]>([]);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [attendance, setAttendance] = useState<AttendanceReportRow[]>([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [attendancePage, setAttendancePage] = useState(1);
  const [finance, setFinance] = useState<FinanceReport | null>(null);
  const [results, setResults] = useState<ResultsReport | null>(null);
  const pageSize = 25;

  const filteredPrograms = useMemo(
    () => programsForOperationalCampus(catalog.programs, filters.campusId, catalog.campuses),
    [catalog.programs, catalog.campuses, filters.campusId]
  );
  const filteredBranches = useMemo(
    () => catalog.branches.filter((b) => !filters.programId || b.programId === filters.programId),
    [catalog.branches, filters.programId]
  );
  const filteredBatches = useMemo(
    () => catalog.batches.filter((b) => !filters.branchId || b.branchId === filters.branchId),
    [catalog.batches, filters.branchId]
  );
  const filteredClasses = useMemo(
    () => catalog.classes.filter((c) => !filters.batchId || c.batchId === filters.batchId),
    [catalog.classes, filters.batchId]
  );
  const filteredSections = useMemo(
    () => catalog.sections.filter((s) => !filters.classId || s.classId === filters.classId),
    [catalog.sections, filters.classId]
  );

  const scopeLabel = useMemo(() => describeReportScope(filters, catalog), [filters, catalog]);

  const campusOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All campuses"]];
    for (const c of catalog.campuses) rows.push([c.id, `${c.code} — ${c.name}`]);
    return rows;
  }, [catalog.campuses]);

  function campusScopedOptions(items: FormSelectOption[], emptyLabel: string): readonly FormSelectOption[] {
    return [["", emptyLabel], ...items];
  }

  const programOptions = useMemo(
    () => campusScopedOptions(filteredPrograms.map((p) => [p.id, `${p.code} — ${p.name}`]), "All departments on campus"),
    [filteredPrograms]
  );
  const branchOptions = useMemo(
    () => campusScopedOptions(filteredBranches.map((b) => [b.id, `${b.code} — ${b.name}`]), "All branches in department"),
    [filteredBranches]
  );
  const batchOptions = useMemo(
    () => campusScopedOptions(filteredBatches.map((b) => [b.id, `${b.startYear}–${b.endYear}`]), "All batches in branch"),
    [filteredBatches]
  );
  const classOptions = useMemo(
    () => campusScopedOptions(filteredClasses.map((c) => [c.id, c.label || `Sem ${c.semesterNumber}`]), "All classes in batch"),
    [filteredClasses]
  );
  const sectionOptions = useMemo(
    () => campusScopedOptions(filteredSections.map((s) => [s.id, s.name]), "All sections in class"),
    [filteredSections]
  );

  function updateFilter(next: Partial<ReportFilters>) {
    setFilters((current) => ({ ...current, ...next }));
    setAttendancePage(1);
  }

  async function loadCatalog() {
    if (mode === "teacher") {
      const structure = await fetchJson<{
        campuses: Campus[];
        programs: Program[];
        branches: Branch[];
        batches: Batch[];
        classes: AcademicClass[];
        sections: Section[];
      }>("/api/portals/teacher/structure");
      setCatalog({
        campuses: structure.campuses,
        programs: structure.programs,
        branches: structure.branches,
        batches: structure.batches,
        classes: structure.classes,
        sections: structure.sections
      });
      return;
    }
    const [campusPage, programPage, branchPage, batchPage, classPage, sectionPage] = await Promise.all([
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100")
    ]);
    setCatalog({
      campuses: campusPage.items,
      programs: programPage.items,
      branches: branchPage.items,
      batches: batchPage.items,
      classes: classPage.items,
      sections: sectionPage.items
    });
  }

  async function loadTeacherAssignments() {
    const data = await fetchJson<{ assignments: TeacherReportAssignment[] }>("/api/portals/teacher/dashboard");
    setAssignments(data.assignments.filter((a) => a.section?.id));
  }

  async function loadReports(attPage = attendancePage) {
    const q = filtersToQuery(filters, attPage, pageSize);
    if (mode === "admin") {
      const [summaryData, financeData] = await Promise.all([
        fetchJson<ReportsSummary>(`/api/reports/summary?${q}`),
        fetchJson<FinanceReport>(`/api/reports/finance?${q}`)
      ]);
      setSummary(summaryData);
      setAttendance([]);
      setAttendanceTotal(0);
      setFinance(financeData);
      setResults(null);
      return;
    }
    const [summaryData, attendancePageData, financeData, resultsData] = await Promise.all([
      fetchJson<ReportsSummary>(`/api/reports/summary?${q}`),
      fetchJson<PaginatedResponse<AttendanceReportRow>>(`/api/reports/attendance?${q}`),
      fetchJson<FinanceReport>(`/api/reports/finance?${q}`),
      fetchJson<ResultsReport>(`/api/reports/results?${q}`)
    ]);
    setSummary(summaryData);
    setAttendance(attendancePageData.items);
    setAttendanceTotal(attendancePageData.total);
    setFinance(financeData);
    setResults(resultsData);
  }

  async function refreshAll() {
    setLoading(true);
    try {
      await loadReports();
      showToast("Reports updated");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load reports", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        if (mode === "admin") await loadCatalog();
        else {
          await Promise.all([loadCatalog(), loadTeacherAssignments()]);
        }
        await loadReports(1);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load reports", "error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttendancePage(1);
    await refreshAll();
  }

  const tabs: { id: ReportTab; label: string }[] =
    mode === "admin"
      ? [
          { id: "overview", label: "Overview" },
          { id: "finance", label: "Finance" }
        ]
      : [
          { id: "overview", label: "Overview" },
          { id: "attendance", label: "Attendance" },
          { id: "finance", label: "Finance" },
          { id: "results", label: "Results" }
        ];

  const exportTarget = REPORT_EXPORT_BY_TAB[tab];

  return (
    <section className="erp-reports-panel">
      {showHeader ? (
        <header className="erp-reports-header erp-reports-header--embedded">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </header>
      ) : null}

      <div className="erp-reports-toolbar db-wf-actions">
        <WfBtn type="button" onClick={() => void refreshAll()}>
          Refresh
        </WfBtn>
      </div>

      <form className="db-card db-form ann-content-card erp-reports-filters" onSubmit={(event) => void submitFilters(event)}>
        <div className="erp-reports-filters-head">
          <div>
            <h3>Filters</h3>
            <p>Campus → department → branch → batch → class → section, plus date range. Leave structure empty for all campuses.</p>
          </div>
          <div className="erp-reports-presets">
            <button
              type="button"
              className="erp-reports-preset"
              onClick={() => {
                setFilters(presetFilters("7d"));
                setAttendancePage(1);
              }}
            >
              7 days
            </button>
            <button
              type="button"
              className="erp-reports-preset"
              onClick={() => {
                setFilters(presetFilters("30d"));
                setAttendancePage(1);
              }}
            >
              30 days
            </button>
            <button
              type="button"
              className="erp-reports-preset"
              onClick={() => {
                setFilters(presetFilters("month"));
                setAttendancePage(1);
              }}
            >
              This month
            </button>
            <button
              type="button"
              className="erp-reports-preset"
              onClick={() => updateFilter({ campusId: "", programId: "", branchId: "", batchId: "", classId: "", sectionId: "" })}
            >
              Clear scope
            </button>
          </div>
        </div>

        {mode === "admin" ? (
          <div className="erp-reports-filter-grid">
            <Field label="Campus">
              <FormSelect
                value={filters.campusId}
                options={campusOptions}
                onChange={(campusId) =>
                  updateFilter({ campusId, programId: "", branchId: "", batchId: "", classId: "", sectionId: "" })
                }
              />
            </Field>
            <Field label="Department">
              <FormSelect
                value={filters.programId}
                options={programOptions}
                disabled={!filters.campusId}
                onChange={(programId) => updateFilter({ programId, branchId: "", batchId: "", classId: "", sectionId: "" })}
              />
            </Field>
            <Field label="Branch">
              <FormSelect
                value={filters.branchId}
                options={branchOptions}
                disabled={!filters.programId}
                onChange={(branchId) => updateFilter({ branchId, batchId: "", classId: "", sectionId: "" })}
              />
            </Field>
            <Field label="Batch">
              <FormSelect
                value={filters.batchId}
                options={batchOptions}
                disabled={!filters.branchId}
                onChange={(batchId) => updateFilter({ batchId, classId: "", sectionId: "" })}
              />
            </Field>
            <Field label="Class">
              <FormSelect
                value={filters.classId}
                options={classOptions}
                disabled={!filters.batchId}
                onChange={(classId) => updateFilter({ classId, sectionId: "" })}
              />
            </Field>
            <Field label="Section">
              <FormSelect
                value={filters.sectionId}
                options={sectionOptions}
                disabled={!filters.classId}
                onChange={(sectionId) => updateFilter({ sectionId })}
              />
            </Field>
          </div>
        ) : (
          <Field label="Section">
            <FormSelect
              value={filters.sectionId}
              options={[
                ["", "All assigned sections"],
                ...assignments.map((a) => [a.section!.id, `${a.role} — ${a.scopeLabel}`] as FormSelectOption)
              ]}
              onChange={(sectionId) => updateFilter({ sectionId })}
            />
          </Field>
        )}

        <div className="erp-reports-date-row">
          <Field label="From">
            <input className="db-input" type="date" value={filters.from} onChange={(e) => updateFilter({ from: e.target.value })} required />
          </Field>
          <Field label="To">
            <input
              className="db-input"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => updateFilter({ to: e.target.value })}
              required
            />
          </Field>
          <WfBtn type="submit" variant="primary">
            Apply filters
          </WfBtn>
        </div>

        <p className="erp-reports-scope-chip">
          <strong>Showing:</strong> {scopeLabel}
        </p>
      </form>

      <div className="erp-reports-tabs-bar">
        <nav className="erp-reports-tabs" aria-label="Report sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`erp-reports-tab${tab === t.id ? " is-active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <ExportTriggerButton onClick={() => setExportOpen(true)}>
          Export {exportTarget.label}
        </ExportTriggerButton>
      </div>

      <ExportFormatDialog
        open={exportOpen}
        cardName={exportTarget.label.replace(/\s+/g, "_")}
        title="Export report"
        description={`Choose a format for the ${exportTarget.label} report using your current filters.`}
        onClose={() => setExportOpen(false)}
        onExport={async (format) => {
          try {
            await downloadReportExport(authFetch, exportTarget.apiPath, format, filters);
            showToast(`${exportTarget.label} export downloaded`);
            setExportOpen(false);
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Export failed", "error");
            throw error;
          }
        }}
      />

      {loading ? (
        <ErpLoader label="Loading reports…" />
      ) : (
        <>
          {(tab === "overview" || (mode === "teacher" && tab === "attendance")) && summary ? (
            <div className="erp-reports-stats">
              <StatCard label="Active students" value={summary.students.active} tone="blue" hint="In selected scope" />
              {mode === "teacher" ? (
                <>
                  <StatCard
                    label="Attendance"
                    value={`${summary.attendance.percentage}%`}
                    tone={summary.attendance.percentage < 75 ? "warn" : "good"}
                    hint={`${summary.attendance.sessions} sessions · ${summary.attendance.present} present`}
                  />
                  <StatCard label="Fees collected" value={currencyInr(summary.finance.collected)} tone="good" hint={`${summary.finance.payments} payments`} />
                  <StatCard
                    label="Result issues"
                    value={summary.results.failedOrAbsent}
                    tone={summary.results.failedOrAbsent ? "bad" : "neutral"}
                    hint={`${summary.results.totalEntries} entries`}
                  />
                </>
              ) : (
                <StatCard label="Fees collected" value={currencyInr(summary.finance.collected)} tone="good" hint={`${summary.finance.payments} payments`} />
              )}
            </div>
          ) : null}

          {tab === "overview" ? (
            <div className="erp-reports-overview-grid">
              <InsightCard title="What belongs here">
                <ul className="erp-reports-list">
                  <li>Overview — headline KPIs for the filtered scope and dates.</li>
                  <li>Finance — collections by fee head and recent receipts.</li>
                  {mode === "teacher" ? (
                    <>
                      <li>Attendance — session-wise present/absent with low-attendance highlights.</li>
                      <li>Results — pass/fail/absent counts and students needing follow-up.</li>
                    </>
                  ) : (
                    <li>Attendance, timetable, results, teams, and applications — teacher/student portals only.</li>
                  )}
                </ul>
              </InsightCard>
              <InsightCard title="Quick read">
                {summary ? (
                  <ul className="erp-reports-list">
                    {mode === "teacher" ? (
                      <li>
                        {summary.attendance.percentage < 75
                          ? "Attendance is below 75% — check the Attendance tab for weak sessions."
                          : "Attendance is healthy for this period."}
                      </li>
                    ) : null}
                    <li>
                      {summary.finance.payments === 0
                        ? "No fee payments in this date range."
                        : `${currencyInr(summary.finance.collected)} collected across ${summary.finance.payments} payments.`}
                    </li>
                  </ul>
                ) : null}
              </InsightCard>
            </div>
          ) : null}

          {mode === "teacher" && tab === "attendance" ? (
            <ReportTable
              title="Attendance sessions"
              empty="No attendance marked in this period for the selected scope."
              columns={["Date", "Section", "Subject", "Present", "Absent", "%"]}
              rows={attendance.map((row) => ({
                key: row.id,
                highlight: row.percentage < 75,
                cells: [
                  formatIstLocaleDate(row.date),
                  row.section,
                  row.subject,
                  String(row.present),
                  String(row.absent),
                  `${row.percentage}%`
                ]
              }))}
              page={attendancePage}
              total={attendanceTotal}
              pageSize={pageSize}
              onPage={async (p) => {
                setAttendancePage(p);
                setLoading(true);
                try {
                  const data = await fetchJson<PaginatedResponse<AttendanceReportRow>>(
                    `/api/reports/attendance?${filtersToQuery(filters, p, pageSize)}`
                  );
                  setAttendance(data.items);
                  setAttendanceTotal(data.total);
                } finally {
                  setLoading(false);
                }
              }}
            />
          ) : null}

          {tab === "finance" && finance ? (
            <>
              <div className="erp-reports-split">
              <InsightCard title="By fee head">
                {finance.byHead.length ? (
                  <div className="erp-reports-fee-list">
                    {finance.byHead.map((row) => (
                      <div key={row.feeHead} className="erp-reports-fee-row">
                        <span>{row.feeHead}</span>
                        <strong>{currencyInr(row.amount)}</strong>
                        <small>{row.count} payments</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="erp-reports-empty">No payments in this period.</p>
                )}
              </InsightCard>
              <InsightCard title="Recent receipts">
                {finance.recent?.length ? (
                  <div className="erp-reports-receipt-list">
                    {finance.recent.slice(0, 12).map((row) => (
                      <div key={row.id} className="erp-reports-receipt-row">
                        <div>
                          <strong>{row.student}</strong>
                          <span>
                            {row.feeHead} · {row.receiptNo}
                          </span>
                        </div>
                        <div>
                          <strong>{currencyInr(row.amount)}</strong>
                          <span>{formatIstLocaleDate(row.paidAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="erp-reports-empty">No receipts.</p>
                )}
              </InsightCard>
              </div>
            </>
          ) : null}

          {mode === "teacher" && tab === "results" && results ? (
            <>
              <div className="erp-reports-split">
              <InsightCard title="Result distribution">
                <div className="erp-reports-result-pills">
                  <span className="pill pass">Pass {results.summary.PASS}</span>
                  <span className="pill fail">Fail {results.summary.FAIL}</span>
                  <span className="pill absent">Absent {results.summary.ABSENT}</span>
                  <span className="pill withheld">Withheld {results.summary.WITHHELD}</span>
                </div>
              </InsightCard>
              <InsightCard title="Students needing attention">
                {results.recentFailures.length ? (
                  <div className="erp-reports-issue-list">
                    {results.recentFailures.map((row) => (
                      <div key={row.id} className="erp-reports-issue-row">
                        <strong>
                          {row.rollNumber} — {row.student}
                        </strong>
                        <span>
                          {row.subject} · {row.status}
                          {row.grade ? ` · Grade ${row.grade}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="erp-reports-empty">No fail/absent entries in scope.</p>
                )}
              </InsightCard>
              </div>
            </>
          ) : null}

        </>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone: "blue" | "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className={`erp-reports-stat erp-reports-stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function InsightCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="db-card ann-content-card erp-reports-card">
      <h4>{title}</h4>
      {children}
    </article>
  );
}

function ReportTable({
  title,
  columns,
  rows,
  empty,
  page,
  total,
  pageSize,
  onPage
}: {
  title: string;
  columns: string[];
  rows: { key: string; cells: string[]; highlight?: boolean }[];
  empty: string;
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void | Promise<void>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <article className="db-card ann-content-card erp-reports-card erp-reports-table-card">
      <div className="erp-reports-table-head">
        <h4>{title}</h4>
        <span>
          {total} record{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="erp-reports-table-wrap">
        <table className="erp-reports-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.highlight ? "is-low" : undefined}>
                {row.cells.map((cell, i) => (
                  <td key={`${row.key}-${i}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="erp-reports-empty">{empty}</p> : null}
      </div>
      {totalPages > 1 ? (
        <div className="erp-reports-pagination">
          <button type="button" className="db-wf-btn" disabled={page <= 1} onClick={() => void onPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button type="button" className="db-wf-btn" disabled={page >= totalPages} onClick={() => void onPage(page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </article>
  );
}

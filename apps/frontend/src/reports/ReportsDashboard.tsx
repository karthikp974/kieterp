import { Download, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { ErpLoader } from "../shared/ErpLoader";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { readApiError } from "../shared/read-api-error";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { toFormSelectOptions, withEmptyOption } from "../shared/select-options";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section } from "../structure/structure-types";
import {
  PORTAL_REPORT_EXPORT_FORMATS,
  PORTAL_REPORT_EXPORT_KINDS,
  attentionReasonLabel,
  downloadPortalReportExport
} from "./portal-reports-export";
import type {
  PortalReportExportFormat,
  PortalReportExportKind,
  PortalReportsDashboard,
  PortalReportsFilters,
  PortalReportsKpis,
  PortalReportsSetup
} from "./portal-reports-types";
import { emptyPortalReportsFilters as emptyFilters } from "./portal-reports-types";

type DashboardMode = "teacher" | "admin";

type CatalogState = {
  campuses: Campus[];
  programs: Program[];
  branches: Branch[];
  batches: Batch[];
  classes: AcademicClass[];
  sections: Section[];
};

const emptyCatalog: CatalogState = {
  campuses: [],
  programs: [],
  branches: [],
  batches: [],
  classes: [],
  sections: []
};

function filtersToQuery(filters: PortalReportsFilters, mode: DashboardMode, teacherSectionId?: string) {
  const params = new URLSearchParams();
  (Object.entries(filters) as [keyof PortalReportsFilters, string][]).forEach(([key, value]) => {
    if (key === "sectionId") return;
    if (value) params.set(key, value);
  });
  if (mode === "teacher") {
    const sectionId = filters.sectionId || teacherSectionId || "";
    if (sectionId) params.set("sectionId", sectionId);
  } else if (filters.sectionId) {
    params.set("sectionId", filters.sectionId);
  }
  return params.toString();
}

const EMPTY_KPIS: PortalReportsKpis = {
  passRate: { percent: 0, label: "Section-wide" },
  avgAttendance: { percent: 0, label: "This semester" },
  feeCollection: { percent: 0, label: "This section" }
};

function KpiGrid({ kpis }: { kpis: NonNullable<PortalReportsDashboard["kpis"]> }) {
  return (
    <div className="erp-reports-dash-kpis">
      <article className="erp-reports-dash-kpi">
        <span>Pass rate</span>
        <strong>{kpis.passRate.percent}%</strong>
        <small>{kpis.passRate.label}</small>
      </article>
      <article className="erp-reports-dash-kpi">
        <span>Avg attendance</span>
        <strong>{kpis.avgAttendance.percent}%</strong>
        <small>{kpis.avgAttendance.label}</small>
      </article>
      <article className="erp-reports-dash-kpi">
        <span>Fee collection</span>
        <strong>{kpis.feeCollection.percent}%</strong>
        <small>{kpis.feeCollection.label}</small>
      </article>
    </div>
  );
}

function ReportsExportDialog({
  open,
  kind,
  sectionName,
  onClose,
  onExport
}: {
  open: boolean;
  kind: PortalReportExportKind | null;
  sectionName: string;
  onClose: () => void;
  onExport: (format: PortalReportExportFormat) => Promise<void>;
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  if (!open || !kind) return null;
  const kindLabel = PORTAL_REPORT_EXPORT_KINDS.find((k) => k.id === kind)?.label ?? kind;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section className="erp-export-dialog" aria-modal="true" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="erp-export-dialog-head">
          <h2>Choose export format</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="erp-export-dialog-lead">
          <strong>{kindLabel}</strong> · {sectionName}
        </p>
        <div className="erp-export-dialog-options">
          {PORTAL_REPORT_EXPORT_FORMATS.map((format) => (
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

export function ReportsDashboard({ mode }: { mode: DashboardMode }) {
  const { authFetch, accessToken } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<PortalReportsSetup | null>(null);
  const [dashboard, setDashboard] = useState<PortalReportsDashboard | null>(null);
  const [filters, setFilters] = useState<PortalReportsFilters>(emptyFilters());
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalog);
  const [exportKind, setExportKind] = useState<PortalReportExportKind | null>(null);

  const setupPath = mode === "teacher" ? "/api/portals/teacher/reports/setup" : "/api/reports/portal/setup";
  const dashboardPath = mode === "teacher" ? "/api/portals/teacher/reports/dashboard" : "/api/reports/portal/dashboard";

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

  const sectionOptions = useMemo((): readonly FormSelectOption[] => {
    if (mode === "admin") {
      return scopedOptions(
        filteredSections.map((s) => [s.id, s.name] as const),
        "All sections in class"
      );
    }
    return toFormSelectOptions(setup?.sections.map((s) => [s.id, s.label] as const) ?? []);
  }, [mode, filteredSections, setup?.sections]);

  function scopedOptions(items: readonly (readonly [string, string])[], emptyLabel: string): readonly FormSelectOption[] {
    return withEmptyOption(items as readonly [string, string][], emptyLabel) as readonly FormSelectOption[];
  }

  const activeSectionId = useMemo(() => {
    if (filters.sectionId) return filters.sectionId;
    if (setup?.fixedSectionId) return setup.fixedSectionId;
    if (setup?.sections[0]?.id) return setup.sections[0].id;
    return "";
  }, [filters.sectionId, setup]);

  const activeSectionName = useMemo(() => {
    const fromSetup = setup?.sections.find((s) => s.id === activeSectionId);
    if (fromSetup) return fromSetup.name;
    const fromCatalog = catalog.sections.find((s) => s.id === activeSectionId);
    return fromCatalog?.name ?? "Section";
  }, [setup, catalog.sections, activeSectionId]);

  const loadCatalog = useCallback(async () => {
    if (mode === "teacher") {
      const structure = await authFetch("/api/portals/teacher/structure");
      if (!structure.ok) throw new Error(await readApiError(structure, "Unable to load structure"));
      const data = (await structure.json()) as CatalogState;
      setCatalog(data);
      return;
    }
    const [campusPage, programPage, branchPage, batchPage, classPage, sectionPage] = await Promise.all([
      authFetch("/api/campuses?pageSize=100"),
      authFetch("/api/core/programs?pageSize=100"),
      authFetch("/api/core/branches?pageSize=100"),
      authFetch("/api/core/batches?pageSize=100"),
      authFetch("/api/core/classes?pageSize=100"),
      authFetch("/api/core/sections?pageSize=100")
    ]);
    const readPage = async <T,>(res: Response) => {
      if (!res.ok) throw new Error(await readApiError(res, "Request failed"));
      return (await res.json()) as PaginatedResponse<T>;
    };
    const [campuses, programs, branches, batches, classes, sections] = await Promise.all([
      readPage<Campus>(campusPage),
      readPage<Program>(programPage),
      readPage<Branch>(branchPage),
      readPage<Batch>(batchPage),
      readPage<AcademicClass>(classPage),
      readPage<Section>(sectionPage)
    ]);
    setCatalog({
      campuses: campuses.items,
      programs: programs.items,
      branches: branches.items,
      batches: batches.items,
      classes: classes.items,
      sections: sections.items
    });
  }, [authFetch, mode]);

  async function refreshDashboard(nextFilters = filters) {
    const teacherFallback =
      setup?.fixedSectionId ?? setup?.sections[0]?.id ?? "";
    const q = filtersToQuery(nextFilters, mode, teacherFallback);
    const response = await authFetch(`${dashboardPath}?${q}`);
    if (!response.ok) throw new Error(await readApiError(response, "Unable to load dashboard"));
    setDashboard((await response.json()) as PortalReportsDashboard);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const setupRes = await authFetch(setupPath);
        if (!setupRes.ok) throw new Error(await readApiError(setupRes, "Unable to load reports setup"));
        const setupData = (await setupRes.json()) as PortalReportsSetup;
        setSetup(setupData);
        await loadCatalog();

        const initialSection =
          mode === "teacher"
            ? setupData.fixedSectionId ?? setupData.sections[0]?.id ?? ""
            : "";
        const nextFilters = { ...emptyFilters(), sectionId: initialSection };
        setFilters(nextFilters);

        const q = filtersToQuery(nextFilters, mode, initialSection);
        const dashRes = await authFetch(`${dashboardPath}?${q}`);
        if (!dashRes.ok) throw new Error(await readApiError(dashRes, "Unable to load reports dashboard"));
        setDashboard((await dashRes.json()) as PortalReportsDashboard);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load reports", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch, setupPath, dashboardPath, loadCatalog, showToast]);

  function updateFilter(next: Partial<PortalReportsFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  async function applyFilters(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await refreshDashboard();
      showToast("Reports updated");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to refresh reports", "error");
    } finally {
      setLoading(false);
    }
  }

  async function onTeacherSectionChange(sectionId: string) {
    const next = { ...filters, sectionId };
    updateFilter({ sectionId });
    try {
      await refreshDashboard(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load section reports", "error");
    }
  }

  async function handleExport(format: PortalReportExportFormat) {
    if (!accessToken || !exportKind) return;
    downloadPortalReportExport(accessToken, mode === "teacher" ? "teacher" : "admin", {
      kind: exportKind,
      format,
      sectionId: activeSectionId || undefined,
      campusId: filters.campusId || undefined,
      programId: filters.programId || undefined,
      branchId: filters.branchId || undefined,
      batchId: filters.batchId || undefined,
      classId: filters.classId || undefined
    });
    showToast("Download started");
    setExportKind(null);
  }

  if (loading && !dashboard) {
    return (
      <div className="erp-reports-dash">
        <ErpLoader label="Loading reports…" />
      </div>
    );
  }

  const showSectionDropdown = mode === "admin" || setup?.showSectionFilter;
  const showSectionPerformance = setup?.showSectionWisePerformance && (dashboard?.sectionPerformance.length ?? 0) > 0;

  const kpis = dashboard?.kpis ?? EMPTY_KPIS;

  return (
    <div className="erp-reports-dash">
      <KpiGrid kpis={kpis} />

      <form className="erp-reports-dash-filters" onSubmit={applyFilters}>
        {mode === "admin" ? (
          <div className="erp-reports-dash-filter-grid">
            <label className="htpo-finance-field-label">
              Campus
              <FormSelect
                value={filters.campusId}
                options={scopedOptions(
                  catalog.campuses.map((c) => [c.id, `${c.code} — ${c.name}`] as const),
                  "All campuses"
                )}
                aria-label="Campus"
                onChange={(campusId) =>
                  updateFilter({ campusId, programId: "", branchId: "", batchId: "", classId: "", sectionId: "" })
                }
              />
            </label>
            <label className="htpo-finance-field-label">
              Department
              <FormSelect
                value={filters.programId}
                options={scopedOptions(
                  filteredPrograms.map((p) => [p.id, `${p.code} — ${p.name}`] as const),
                  "All departments"
                )}
                aria-label="Department"
                onChange={(programId) =>
                  updateFilter({ programId, branchId: "", batchId: "", classId: "", sectionId: "" })
                }
              />
            </label>
            <label className="htpo-finance-field-label">
              Branch
              <FormSelect
                value={filters.branchId}
                options={scopedOptions(
                  filteredBranches.map((b) => [b.id, `${b.code} — ${b.name}`] as const),
                  "All branches"
                )}
                aria-label="Branch"
                onChange={(branchId) => updateFilter({ branchId, batchId: "", classId: "", sectionId: "" })}
              />
            </label>
            <label className="htpo-finance-field-label">
              Batch
              <FormSelect
                value={filters.batchId}
                options={scopedOptions(
                  filteredBatches.map((b) => [b.id, `${b.startYear}–${b.endYear}`] as const),
                  "All batches"
                )}
                aria-label="Batch"
                onChange={(batchId) => updateFilter({ batchId, classId: "", sectionId: "" })}
              />
            </label>
            <label className="htpo-finance-field-label">
              Semester
              <FormSelect
                value={filters.classId}
                options={scopedOptions(
                  filteredClasses.map((c) => [c.id, c.label || `Sem ${c.semesterNumber}`] as const),
                  "All semesters"
                )}
                aria-label="Semester"
                onChange={(classId) => updateFilter({ classId, sectionId: "" })}
              />
            </label>
            <label className="htpo-finance-field-label">
              Section
              <FormSelect
                value={filters.sectionId}
                options={sectionOptions}
                aria-label="Section"
                onChange={(sectionId) => updateFilter({ sectionId })}
              />
            </label>
          </div>
        ) : showSectionDropdown ? (
          <div className="erp-reports-dash-section-filter">
            <label className="htpo-finance-field-label">
              Section
              <FormSelect
                value={activeSectionId}
                options={sectionOptions}
                aria-label="Section"
                onChange={(sectionId) => void onTeacherSectionChange(sectionId)}
              />
            </label>
          </div>
        ) : null}
        {mode === "admin" ? (
          <button type="submit" className="db-wf-btn db-wf-btn--primary">
            Apply filters
          </button>
        ) : null}
      </form>

      {showSectionPerformance ? (
        <section className="erp-reports-dash-card">
          <h2 className="erp-reports-dash-card-title">Section-wise performance</h2>
          <ul className="erp-reports-dash-performance">
            {dashboard!.sectionPerformance.map((row) => (
              <li key={row.sectionId}>
                <div className="erp-reports-dash-performance-head">
                  <span>{row.label}</span>
                  <strong>{row.percent}%</strong>
                </div>
                <div className="erp-reports-dash-progress" aria-hidden>
                  <span style={{ width: `${Math.min(row.percent, 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="erp-reports-dash-split">
        <section className="erp-reports-dash-card">
          <h2 className="erp-reports-dash-card-title">Top performers</h2>
          {dashboard?.topPerformers.items.length ? (
            <ul className="erp-reports-dash-students">
              {dashboard.topPerformers.items.map((row) => (
                <li key={`${row.studentProfileId}-${row.semesterLabel}`}>
                  <div>
                    <strong>{row.fullName}</strong>
                    <small>{row.semesterLabel}</small>
                  </div>
                  <span className="erp-reports-dash-badge erp-reports-dash-badge--good">{row.gradeBadge}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="erp-reports-dash-empty">No published semester results yet.</p>
          )}
        </section>

        <section className="erp-reports-dash-card">
          <h2 className="erp-reports-dash-card-title">Need attention</h2>
          {dashboard?.needAttention.items.length ? (
            <ul className="erp-reports-dash-students">
              {dashboard.needAttention.items.map((row) => (
                <li key={`${row.studentProfileId}-${row.semesterLabel}`}>
                  <div>
                    <strong>{row.fullName}</strong>
                    <small>
                      {row.semesterLabel}
                      {row.reasons?.length
                        ? ` · ${row.reasons.map(attentionReasonLabel).join(", ")}`
                        : ""}
                    </small>
                  </div>
                  <span className="erp-reports-dash-badge erp-reports-dash-badge--warn">{row.gradeBadge}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="erp-reports-dash-empty">No students flagged at current thresholds.</p>
          )}
        </section>
      </div>

      <section className="erp-reports-dash-card">
        <h2 className="erp-reports-dash-card-title">Export reports</h2>
        <div className="erp-reports-dash-export-list">
          {PORTAL_REPORT_EXPORT_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className="erp-reports-dash-export-btn"
              disabled={!activeSectionId}
              onClick={() => setExportKind(kind.id)}
            >
              <Download size={16} aria-hidden />
              {kind.label}
            </button>
          ))}
        </div>
      </section>

      <ReportsExportDialog
        open={Boolean(exportKind)}
        kind={exportKind}
        sectionName={activeSectionName}
        onClose={() => setExportKind(null)}
        onExport={handleExport}
      />
    </div>
  );
}

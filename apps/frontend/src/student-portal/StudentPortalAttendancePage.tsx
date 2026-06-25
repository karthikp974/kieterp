import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { FormSelect } from "../shared/FormSelect";
import { formatIsoDateDdMmYyyy } from "../shared/calendar-days";
import {
  isPortalCustomRangeValid,
  PortalCustomDateRangeModal,
  type PortalCustomDateRangeDraft
} from "../shared/PortalCustomDateRangeModal";
import { useToast } from "../shared/toast-context";
import type { StudentAttendancePageResponse } from "./student-attendance-types";
import {
  buildExportSemesterOptions,
  chartYearOptionsFromEntries,
  STUDENT_ATT_MONTH_RANGE_OPTIONS,
  type StudentMonthChartRange
} from "./student-attendance-chart-utils";
import { StudentAttendanceProgressRing } from "./StudentAttendanceProgressRing";
import { StudentAttendanceChartsSkeleton, StudentPortalAttendanceSkeleton } from "./StudentPortalAttendanceSkeleton";

const StudentAttendanceCharts = lazy(() =>
  import("./StudentAttendanceCharts").then((m) => ({ default: m.StudentAttendanceCharts }))
);

function parseFilename(cd: string | null, fallback: string) {
  if (!cd) return fallback;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return (m?.[1] ?? fallback).replace(/["']/g, "").trim() || fallback;
}

function pctLabel(v: number | null) {
  if (v === null) return "—";
  return `${v}%`;
}

export function StudentPortalAttendancePage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentAttendancePageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableBusy, setTableBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [exportKey, setExportKey] = useState<string | null>(null);
  const [exportMonthPeriod, setExportMonthPeriod] = useState<StudentMonthChartRange>("last_1_month");
  const [exportSemesterNumber, setExportSemesterNumber] = useState("");
  const [exportCustomOpen, setExportCustomOpen] = useState(false);
  const [exportCustomDraft, setExportCustomDraft] = useState<PortalCustomDateRangeDraft>({});
  const [exportCustomApplied, setExportCustomApplied] = useState<{ dateFrom: string; dateTo: string } | null>(null);

  const pageSize = 25;

  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!hasLoaded) setLoading(true);
    else setTableBusy(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await authFetch(`/api/portals/student/attendance?${qs.toString()}`);
      if (!res.ok) throw new Error("bad");
      const json = (await res.json()) as StudentAttendancePageResponse;
      setData(json);
      setHasLoaded(true);
    } catch {
      showToast("Could not load attendance.", "error");
      if (!hasLoaded) setData(null);
    } finally {
      setLoading(false);
      setTableBusy(false);
    }
  }, [authFetch, hasLoaded, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.history.total / data.history.pageSize));
  }, [data]);

  const exportYearOptions = useMemo(
    () => chartYearOptionsFromEntries(data?.chartEntries ?? []),
    [data?.chartEntries]
  );

  const exportSemesterOptions = useMemo(
    () => buildExportSemesterOptions(data?.section.semesterNumber ?? 1),
    [data?.section.semesterNumber]
  );

  useEffect(() => {
    const current = String(data?.section.semesterNumber ?? 1);
    if (!exportSemesterNumber || !exportSemesterOptions.some((opt) => opt.value === exportSemesterNumber)) {
      setExportSemesterNumber(current);
    }
  }, [data?.section.semesterNumber, exportSemesterNumber, exportSemesterOptions]);

  const downloadExport = useCallback(
    async (range: "month" | "semester" | "overall", format: "pdf" | "xlsx") => {
      if (range === "month" && exportMonthPeriod === "custom" && !exportCustomApplied) {
        showToast("Choose a custom date range first.", "error");
        return;
      }

      const qs = new URLSearchParams({ range, format });
      if (range === "month") {
        qs.set("monthPeriod", exportMonthPeriod);
        if (exportMonthPeriod === "custom" && exportCustomApplied) {
          qs.set("dateFrom", exportCustomApplied.dateFrom);
          qs.set("dateTo", exportCustomApplied.dateTo);
        }
      }
      if (range === "semester") {
        qs.set("semesterNumber", exportSemesterNumber || String(data?.section.semesterNumber ?? 1));
      }

      const key = `${range}-${range === "month" ? exportMonthPeriod : range === "semester" ? exportSemesterNumber : "all"}-${format}`;
      setExportKey(key);
      try {
        const res = await authFetch(`/api/portals/student/attendance/export?${qs.toString()}`);
        if (!res.ok) {
          showToast("Export failed.", "error");
          return;
        }
        const blob = await res.blob();
        const ext = format === "xlsx" ? "xlsx" : "pdf";
        const fallback = `attendance-${range}.${ext}`;
        const fn = parseFilename(res.headers.get("Content-Disposition"), fallback);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fn;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast("Download started.", "success");
      } catch {
        showToast("Export failed.", "error");
      } finally {
        setExportKey(null);
      }
    },
    [authFetch, data?.section.semesterNumber, exportCustomApplied, exportMonthPeriod, exportSemesterNumber, showToast]
  );

  function handleExportMonthPeriodChange(next: string) {
    const period = next as StudentMonthChartRange;
    if (period === "custom") {
      const ongoing = exportYearOptions.find((row) => row.isOngoing)?.year ?? exportYearOptions[0]?.year;
      setExportCustomDraft({
        dateFrom: exportCustomApplied?.dateFrom,
        dateTo: exportCustomApplied?.dateTo,
        year: ongoing
      });
      setExportCustomOpen(true);
      setExportMonthPeriod("custom");
      return;
    }
    setExportMonthPeriod(period);
  }

  function applyExportCustomRange() {
    if (!isPortalCustomRangeValid(exportCustomDraft) || !exportCustomDraft.dateFrom || !exportCustomDraft.dateTo) return;
    setExportCustomApplied({
      dateFrom: exportCustomDraft.dateFrom,
      dateTo: exportCustomDraft.dateTo
    });
    setExportMonthPeriod("custom");
    setExportCustomOpen(false);
  }

  if (loading && !data) {
    return <StudentPortalAttendanceSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Attendance could not be loaded.</p>;
  }

  return (
    <div className="sp-att">
      <div className="sp-att-stat-grid">
        <article className="sp-att-stat-card">
          <StudentAttendanceProgressRing
            percentage={data.thisMonth.percentage}
            label="This month"
            sublabel={data.thisMonth.monthLabel}
          />
          <ul className="sp-att-stat-list">
            <li>
              <span>Attended</span>
              <strong>{data.thisMonth.present}</strong>
            </li>
            <li>
              <span>Absent</span>
              <strong>{data.thisMonth.absent}</strong>
            </li>
            <li>
              <span>Recorded</span>
              <strong>{data.thisMonth.total}</strong>
            </li>
          </ul>
        </article>

        <article className="sp-att-stat-card">
          <StudentAttendanceProgressRing percentage={data.overall.percentage} label="Overall" sublabel="All days" />
          <ul className="sp-att-stat-list">
            <li>
              <span>Attended</span>
              <strong>{data.overall.present}</strong>
            </li>
            <li>
              <span>Absent</span>
              <strong>{data.overall.absent}</strong>
            </li>
            <li>
              <span>Recorded</span>
              <strong>{data.overall.total}</strong>
            </li>
          </ul>
        </article>

        <article className="sp-att-stat-card">
          <StudentAttendanceProgressRing
            percentage={data.semester.percentage}
            label="This semester"
            sublabel={`Semester ${data.semester.semesterNumber}`}
          />
          <ul className="sp-att-stat-list">
            <li>
              <span>Attended</span>
              <strong>{data.semester.present}</strong>
            </li>
            <li>
              <span>Absent</span>
              <strong>{data.semester.absent}</strong>
            </li>
            <li>
              <span>Recorded</span>
              <strong>{data.semester.total}</strong>
            </li>
          </ul>
        </article>
      </div>

      <Suspense fallback={<StudentAttendanceChartsSkeleton />}>
        <StudentAttendanceCharts
          monthlyTrend={data.monthlyTrend}
          chartEntries={data.chartEntries ?? []}
        />
      </Suspense>

      <section className="sp-att-export" aria-label="Export attendance">
        <h2 className="sp-att-section-title">Export</h2>
        <p className="sp-att-section-desc">Download PDF or Excel for a chosen period, semester scope, or your full record.</p>
        <div className="sp-att-export-grid">
          <div className="sp-att-export-block">
            <p className="sp-att-export-block-title">This month</p>
            <div className="sp-att-export-block-controls">
              <FormSelect
                aria-label="Export month period"
                className="sp-att-export-filter htpo-att-period-select"
                value={exportMonthPeriod}
                options={STUDENT_ATT_MONTH_RANGE_OPTIONS.map(([id, label]) => [id, label] as [string, string])}
                onChange={handleExportMonthPeriodChange}
              />
              {exportMonthPeriod === "custom" && exportCustomApplied ? (
                <button
                  type="button"
                  className="htpo-att-period-edit sp-att-export-edit-dates sp-att-chart-range-label"
                  aria-label={`Custom export period from ${formatIsoDateDdMmYyyy(exportCustomApplied.dateFrom)} to ${formatIsoDateDdMmYyyy(exportCustomApplied.dateTo)}. Tap to change dates.`}
                  onClick={() => {
                    setExportCustomDraft({
                      dateFrom: exportCustomApplied.dateFrom,
                      dateTo: exportCustomApplied.dateTo,
                      year: exportYearOptions.find((row) => row.isOngoing)?.year ?? exportYearOptions[0]?.year
                    });
                    setExportCustomOpen(true);
                  }}
                >
                  <span>{formatIsoDateDdMmYyyy(exportCustomApplied.dateFrom)}</span>
                  <span>{formatIsoDateDdMmYyyy(exportCustomApplied.dateTo)}</span>
                </button>
              ) : null}
            </div>
            <div className="sp-att-export-btns">
              <button
                type="button"
                className="sp-att-export-btn"
                disabled={!!exportKey}
                onClick={() => void downloadExport("month", "pdf")}
              >
                {exportKey === `month-${exportMonthPeriod}-pdf` ? "Preparing…" : "PDF"}
              </button>
              <button
                type="button"
                className="sp-att-export-btn sp-att-export-btn--secondary"
                disabled={!!exportKey}
                onClick={() => void downloadExport("month", "xlsx")}
              >
                {exportKey === `month-${exportMonthPeriod}-xlsx` ? "Preparing…" : "Excel"}
              </button>
            </div>
          </div>

          <div className="sp-att-export-block">
            <p className="sp-att-export-block-title">Semester</p>
            <div className="sp-att-export-block-controls">
              <FormSelect
                aria-label="Export semester scope"
                className="sp-att-export-filter htpo-att-period-select"
                value={exportSemesterNumber}
                options={exportSemesterOptions.map((opt) => [opt.value, opt.label] as [string, string])}
                onChange={setExportSemesterNumber}
              />
            </div>
            <div className="sp-att-export-btns">
              <button
                type="button"
                className="sp-att-export-btn"
                disabled={!!exportKey}
                onClick={() => void downloadExport("semester", "pdf")}
              >
                {exportKey === `semester-${exportSemesterNumber}-pdf` ? "Preparing…" : "PDF"}
              </button>
              <button
                type="button"
                className="sp-att-export-btn sp-att-export-btn--secondary"
                disabled={!!exportKey}
                onClick={() => void downloadExport("semester", "xlsx")}
              >
                {exportKey === `semester-${exportSemesterNumber}-xlsx` ? "Preparing…" : "Excel"}
              </button>
            </div>
          </div>

          <div className="sp-att-export-block">
            <p className="sp-att-export-block-title">Overall</p>
            <div className="sp-att-export-block-controls sp-att-export-block-controls--empty" aria-hidden />
            <div className="sp-att-export-btns">
              <button
                type="button"
                className="sp-att-export-btn"
                disabled={!!exportKey}
                onClick={() => void downloadExport("overall", "pdf")}
              >
                {exportKey === "overall-all-pdf" ? "Preparing…" : "PDF"}
              </button>
              <button
                type="button"
                className="sp-att-export-btn sp-att-export-btn--secondary"
                disabled={!!exportKey}
                onClick={() => void downloadExport("overall", "xlsx")}
              >
                {exportKey === "overall-all-xlsx" ? "Preparing…" : "Excel"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <PortalCustomDateRangeModal
        open={exportCustomOpen}
        title="Custom export period"
        draft={exportCustomDraft}
        yearOptions={exportYearOptions}
        onDraftChange={setExportCustomDraft}
        onClose={() => {
          setExportCustomOpen(false);
          if (exportMonthPeriod === "custom" && !exportCustomApplied) setExportMonthPeriod("last_1_month");
        }}
        onApply={applyExportCustomRange}
      />

      <section className="sp-att-history" aria-label="Attendance history">
        <div className="sp-att-history-head">
          <div>
            <h2 className="sp-att-section-title">History</h2>
            <p className="sp-att-history-note">
              All recorded days on your profile, including earlier semesters (e.g. Sem 1 when you are in Sem 2).
            </p>
          </div>
          <p className="sp-att-history-count">
            {data.history.total} record{data.history.total === 1 ? "" : "s"}
          </p>
        </div>

        <div className="sp-att-table-wrap">
          <table className="sp-att-table sp-att-table--history">
            <colgroup>
              <col className="sp-att-col-date" />
              <col className="sp-att-col-faculty" />
              <col className="sp-att-col-status" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Faculty</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableBusy ? (
                <tr>
                  <td colSpan={3} className="sp-att-table-loading">
                    Updating…
                  </td>
                </tr>
              ) : data.history.items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="sp-att-table-empty">
                    No attendance has been recorded yet. When teachers mark attendance for your section, it will appear here.
                  </td>
                </tr>
              ) : (
                data.history.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.facultyName}</td>
                    <td>
                      <span className={`sp-att-badge ${row.status === "PRESENT" ? "sp-att-badge--ok" : "sp-att-badge--bad"}`}>
                        {row.status === "PRESENT" ? "Present" : "Absent"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data.history.total > pageSize ? (
          <nav className="sp-att-pager" aria-label="History pages">
            <button type="button" className="sp-att-pager-btn" disabled={page <= 1 || tableBusy} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={18} aria-hidden />
              Prev
            </button>
            <span className="sp-att-pager-meta">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="sp-att-pager-btn"
              disabled={page >= totalPages || tableBusy}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight size={18} aria-hidden />
            </button>
          </nav>
        ) : null}
      </section>

    </div>
  );
}

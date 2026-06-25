import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatIsoDateDdMmYyyy } from "../shared/calendar-days";
import { FormSelect } from "../shared/FormSelect";
import {
  isPortalCustomRangeValid,
  PortalCustomDateRangeModal,
  type PortalCustomDateRangeDraft
} from "../shared/PortalCustomDateRangeModal";
import { useOptionalPortalTheme } from "../shared/portal-theme";
import { studentPortalChartTheme } from "./student-portal-chart-theme";
import type {
  StudentAttendanceChartEntry,
  StudentAttendanceTrendPoint
} from "./student-attendance-types";
import {
  bucketCustomMonthlyTrend,
  chartYearOptionsFromEntries,
  filterMonthlyTrend,
  formatMonthChartDetailLabel,
  monthRangeBarLimit,
  monthlyTrendToChartRows,
  STUDENT_ATT_MONTH_RANGE_OPTIONS,
  trimChartRows,
  type AttendanceChartRow,
  type StudentMonthChartRange
} from "./student-attendance-chart-utils";

type Props = {
  monthlyTrend: StudentAttendanceTrendPoint[];
  chartEntries: StudentAttendanceChartEntry[];
};

const Y_TICKS = [0, 25, 50, 75, 100];

function AttendanceBarChart({
  data,
  selectedKey,
  onSelect
}: {
  data: AttendanceChartRow[];
  selectedKey: string | null;
  onSelect: (row: AttendanceChartRow) => void;
}) {
  const portalTheme = useOptionalPortalTheme();
  const chart = studentPortalChartTheme(portalTheme?.mode ?? "light");
  const scrollable = data.length > 6;
  const barWidth = data.length > 18 ? 52 : data.length > 12 ? 56 : 58;
  const innerWidth = scrollable ? Math.max(data.length * barWidth, 320) : undefined;
  const labelAngle = data.length > 6 ? -40 : 0;
  const tickFontSize = data.length > 18 ? 10 : 11;
  const bottomMargin = labelAngle ? 34 : scrollable ? 16 : 4;

  return (
    <div className={`sp-att-chart-static${scrollable ? " sp-att-chart-static--scroll" : ""}`}>
      <div className="sp-att-chart-inner" style={innerWidth ? { width: innerWidth, minWidth: "100%" } : undefined}>
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: bottomMargin }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="name"
              interval={0}
              angle={labelAngle}
              textAnchor={labelAngle ? "end" : "middle"}
              height={labelAngle ? 48 : 30}
              tick={{ fontSize: tickFontSize, fill: chart.axis }}
              axisLine={{ stroke: chart.muted }}
              tickLine={{ stroke: chart.muted }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={Y_TICKS}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: chart.axis }}
              axisLine={{ stroke: chart.muted }}
              tickLine={{ stroke: chart.muted }}
              width={44}
            />
            <Bar
              name="Attendance"
              dataKey="pct"
              fill={chart.bar}
              radius={[6, 6, 0, 0]}
              maxBarSize={scrollable ? 36 : 48}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(bar) => onSelect(bar.payload as AttendanceChartRow)}
            >
              {data.map((row) => (
                <Cell
                  key={row.key}
                  fill={chart.bar}
                  opacity={selectedKey && row.key !== selectedKey ? 0.45 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartPanelHeader({
  title,
  desc,
  filterLabel,
  filterValue,
  filterOptions,
  onFilterChange,
  dateRangeAction
}: {
  title: string;
  desc: string;
  filterLabel: string;
  filterValue: string;
  filterOptions: readonly [string, string][];
  onFilterChange: (value: string) => void;
  dateRangeAction?: ReactNode;
}) {
  return (
    <>
      <div className="sp-att-chart-head">
        <div className="sp-att-chart-head__main">
          <h3 className="sp-att-chart-title">{title}</h3>
          {dateRangeAction}
        </div>
        <FormSelect
          aria-label={filterLabel}
          className="sp-att-chart-filter sp-att-chart-period-select htpo-att-period-select"
          value={filterValue}
          options={filterOptions.map(([id, label]) => [id, label] as [string, string])}
          onChange={onFilterChange}
        />
      </div>
      <p className="sp-att-chart-desc">{desc}</p>
    </>
  );
}

export function StudentAttendanceCharts({ monthlyTrend, chartEntries }: Props) {
  const [monthRange, setMonthRange] = useState<StudentMonthChartRange>("last_6_months");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<PortalCustomDateRangeDraft>({});
  const [appliedCustom, setAppliedCustom] = useState<{ dateFrom: string; dateTo: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<AttendanceChartRow | null>(null);

  const yearOptions = useMemo(() => chartYearOptionsFromEntries(chartEntries), [chartEntries]);

  const trendData = useMemo(() => {
    let raw: AttendanceChartRow[] = [];
    if (monthRange === "custom") {
      if (!appliedCustom) return [];
      raw = bucketCustomMonthlyTrend(chartEntries, appliedCustom.dateFrom, appliedCustom.dateTo);
    } else {
      raw = monthlyTrendToChartRows(filterMonthlyTrend(monthlyTrend, monthRange));
    }
    return trimChartRows(raw, monthRangeBarLimit(monthRange));
  }, [appliedCustom, chartEntries, monthRange, monthlyTrend]);

  const monthDesc = useMemo(() => {
    if (monthRange === "custom" && appliedCustom) {
      const withRecords = trendData.filter((row) => row.total > 0).length;
      if (trendData.length > 0) {
        return `Every calendar month from ${formatIsoDateDdMmYyyy(appliedCustom.dateFrom)} to ${formatIsoDateDdMmYyyy(appliedCustom.dateTo)} (${withRecords} of ${trendData.length} months with records). Scroll the chart for more.`;
      }
      return "Attendance by calendar month for your selected period.";
    }
    if (monthRange === "last_1_month") return "Recorded attendance percentage for the last calendar month.";
    if (monthRange === "last_3_months") return "Recorded attendance percentage for the last three calendar months.";
    return "Recorded attendance percentage for the last six calendar months.";
  }, [appliedCustom, monthRange, trendData.length]);

  function handleMonthRangeChange(next: string) {
    const range = next as StudentMonthChartRange;
    setSelectedMonth(null);
    if (range === "custom") {
      const ongoing = yearOptions.find((row) => row.isOngoing)?.year ?? yearOptions[0]?.year;
      setCustomDraft({
        dateFrom: appliedCustom?.dateFrom,
        dateTo: appliedCustom?.dateTo,
        year: ongoing
      });
      setCustomOpen(true);
      setMonthRange("custom");
      return;
    }
    setMonthRange(range);
  }

  function applyCustomRange() {
    if (!isPortalCustomRangeValid(customDraft) || !customDraft.dateFrom || !customDraft.dateTo) return;
    setAppliedCustom({
      dateFrom: customDraft.dateFrom,
      dateTo: customDraft.dateTo
    });
    setSelectedMonth(null);
    setMonthRange("custom");
    setCustomOpen(false);
  }

  const emptyTrend =
    trendData.length === 0 ||
    (monthRange !== "custom" && trendData.every((d) => d.total === 0));

  function openCustomModal() {
    setCustomDraft({
      dateFrom: appliedCustom?.dateFrom,
      dateTo: appliedCustom?.dateTo,
      year: yearOptions.find((row) => row.isOngoing)?.year ?? yearOptions[0]?.year
    });
    setCustomOpen(true);
  }

  return (
    <>
      <div className="sp-att-chart-grid">
        <section className="sp-att-chart-panel" aria-label="Monthly attendance trend">
          <ChartPanelHeader
            title="Monthly trend"
            desc={monthDesc}
            filterLabel="Monthly chart period"
            filterValue={monthRange}
            filterOptions={STUDENT_ATT_MONTH_RANGE_OPTIONS}
            onFilterChange={handleMonthRangeChange}
            dateRangeAction={
              monthRange === "custom" && appliedCustom ? (
                <button
                  type="button"
                  className="sp-att-chart-range-label htpo-att-period-edit"
                  aria-label={`Custom period from ${formatIsoDateDdMmYyyy(appliedCustom.dateFrom)} to ${formatIsoDateDdMmYyyy(appliedCustom.dateTo)}. Tap to change dates.`}
                  onClick={openCustomModal}
                >
                  <span>{formatIsoDateDdMmYyyy(appliedCustom.dateFrom)}</span>
                  <span>{formatIsoDateDdMmYyyy(appliedCustom.dateTo)}</span>
                </button>
              ) : null
            }
          />
          <div className="sp-att-chart-focus" role="status" aria-live="polite">
            {selectedMonth ? (
              <>
                <span className="sp-att-chart-focus-label">{formatMonthChartDetailLabel(selectedMonth.key)}</span>
                <span className="sp-att-chart-focus-value">
                  {selectedMonth.total ? `${selectedMonth.pct}% attendance` : "No records"}
                </span>
                {selectedMonth.total ? (
                  <span className="sp-att-chart-focus-meta">
                    {selectedMonth.present} present · {selectedMonth.total - selectedMonth.present} absent
                  </span>
                ) : null}
              </>
            ) : (
              <span className="sp-att-chart-focus-hint">Tap a bar to see that month&apos;s attendance.</span>
            )}
          </div>
          <div className="sp-att-chart-box">
            {emptyTrend ? (
              <p className="sp-att-chart-empty">
                {monthRange === "custom" && !appliedCustom
                  ? "Choose a custom date range to view attendance."
                  : "No attendance recorded for this period yet."}
              </p>
            ) : (
              <AttendanceBarChart
                data={trendData}
                selectedKey={selectedMonth?.key ?? null}
                onSelect={setSelectedMonth}
              />
            )}
          </div>
        </section>
      </div>

      <PortalCustomDateRangeModal
        open={customOpen}
        draft={customDraft}
        yearOptions={yearOptions}
        onDraftChange={setCustomDraft}
        onClose={() => {
          setCustomOpen(false);
          if (monthRange === "custom" && !appliedCustom) setMonthRange("last_6_months");
        }}
        onApply={applyCustomRange}
      />
    </>
  );
}

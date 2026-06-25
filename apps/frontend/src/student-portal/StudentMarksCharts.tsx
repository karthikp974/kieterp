import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useOptionalPortalTheme } from "../shared/portal-theme";
import { studentPortalChartTheme } from "./student-portal-chart-theme";
import { marksChartHasGpa, chartMetricValue, useChartBarSelection, type MarksChartRow } from "./student-marks-chart-utils";
import type { StudentMarksPageResponse } from "./student-marks-types";

type Props = Pick<StudentMarksPageResponse, "chart">;

type ChartPoint = {
  name: string;
  semesterNumber: number;
  value: number;
  displayValue: number | null;
  subjects: number;
};

type GpaMetric = "sgpa" | "cgpa";

function formatGpa(value: number | null) {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function GpaBarChart({
  title,
  metric,
  rows,
  emptyMessage
}: {
  title: string;
  metric: GpaMetric;
  rows: MarksChartRow[];
  emptyMessage: string;
}) {
  const portalTheme = useOptionalPortalTheme();
  const chartTheme = studentPortalChartTheme(portalTheme?.mode ?? "light");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { onBarClick, onBarPointerDown, onBarPointerUp, onBarPointerCancel } = useChartBarSelection<ChartPoint>(
    (row) => row.name
  );

  const data = useMemo(
    () =>
      rows.map((row) => {
        const displayValue = chartMetricValue(row, metric);
        return {
          name: row.semesterLabel,
          semesterNumber: row.semesterNumber,
          value: displayValue ?? 0,
          displayValue,
          subjects: row.subjects
        };
      }),
    [metric, rows]
  );

  const hasValues = data.some((row) => row.displayValue != null);
  const selected = data.find((row) => row.name === selectedKey) ?? null;
  const metricLabel = metric === "sgpa" ? "SGPA" : "CGPA";
  const focusHint =
    metric === "sgpa"
      ? "Tap a bar to see that semester\u2019s SGPA."
      : "Tap a bar to see that semester\u2019s CGPA.";

  if (!hasValues) {
    return (
      <section className="sp-marks-chart-panel" aria-label={title}>
        <h3 className="sp-marks-chart-title">{title}</h3>
        <p className="sp-marks-chart-empty">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="sp-marks-chart-panel" aria-label={title}>
      <h3 className="sp-marks-chart-title">{title}</h3>

      <div className="sp-att-chart-focus sp-marks-chart-focus" role="status" aria-live="polite">
        {selected?.displayValue != null ? (
          <>
            <span className="sp-att-chart-focus-label">Semester {selected.name}</span>
            <span className="sp-att-chart-focus-value">
              {metricLabel} {formatGpa(selected.displayValue)}
            </span>
            <span className="sp-att-chart-focus-meta">
              {selected.subjects} subject{selected.subjects === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="sp-att-chart-focus-hint">{focusHint}</span>
        )}
      </div>

      <div className="sp-marks-chart-box">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: chartTheme.axis }}
              axisLine={{ stroke: chartTheme.muted }}
              tickLine={{ stroke: chartTheme.muted }}
              interval={0}
              height={36}
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
              tick={{ fontSize: 11, fill: chartTheme.axis }}
              axisLine={{ stroke: chartTheme.muted }}
              tickLine={{ stroke: chartTheme.muted }}
              width={28}
            />
            <Bar
              dataKey="value"
              fill={chartTheme.bar}
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
              activeBar={false}
              cursor="pointer"
              onClick={(bar) => {
                const row = bar.payload as ChartPoint;
                onBarClick(row, setSelectedKey);
              }}
            >
              {data.map((row) => (
                <Cell
                  key={row.name}
                  fill={chartTheme.bar}
                  opacity={selectedKey && row.name !== selectedKey ? 0.45 : 1}
                  onTouchStart={(event) => {
                    const touch = event.touches[0];
                    if (!touch) return;
                    onBarPointerDown(row, setSelectedKey, touch.clientX, touch.clientY);
                  }}
                  onTouchEnd={(event) => {
                    const touch = event.changedTouches[0];
                    if (!touch) return;
                    onBarPointerUp(row, setSelectedKey, touch.clientX, touch.clientY);
                  }}
                  onTouchCancel={onBarPointerCancel}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function StudentMarksCharts({ chart: chartData }: Props) {
  if (!chartData.length || !marksChartHasGpa(chartData)) {
    return (
      <div className="sp-marks-chart-panel sp-marks-chart-panel--standalone">
        <h3 className="sp-marks-chart-title">SGPA &amp; CGPA</h3>
        <p className="sp-marks-chart-empty">Charts appear when subjects have JNTUK letter grades and credits on file.</p>
      </div>
    );
  }

  return (
    <div className="sp-marks-chart-grid">
      <GpaBarChart
        title="SGPA by semester"
        metric="sgpa"
        rows={chartData}
        emptyMessage="No semester SGPA yet — grades and credits are required."
      />
      <GpaBarChart
        title="CGPA trend"
        metric="cgpa"
        rows={chartData}
        emptyMessage="No cumulative CGPA yet — complete at least one graded semester."
      />
    </div>
  );
}

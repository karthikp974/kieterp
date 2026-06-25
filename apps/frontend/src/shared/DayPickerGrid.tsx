import { useMemo } from "react";
import {
  buildDayGridCells,
  buildIsoDate,
  dayPickerColumnCount,
  dayPickerSummary,
  daysInMonth,
  dayFromIsoDate,
  isCalendarDayBeforeMin,
  parseIsoDate
} from "./calendar-days";

type DayPickerGridProps = {
  year?: number;
  month?: number;
  value?: string;
  onChange: (isoDate: string | undefined) => void;
  disabled?: boolean;
  required?: boolean;
  minDate?: string;
  className?: string;
  "aria-label"?: string;
};

/** Four-row day grid — 28 / 29 / 30 / 31 cells from year + month (no native date picker). */
export function DayPickerGrid({
  year,
  month,
  value,
  onChange,
  disabled = false,
  required = false,
  minDate,
  className = "",
  "aria-label": ariaLabel = "Pick a day"
}: DayPickerGridProps) {
  const selectedDay = dayFromIsoDate(value);
  const ready = Boolean(year && month) && !disabled;

  const dayCount = year && month ? daysInMonth(year, month) : 0;
  const columns = dayCount ? dayPickerColumnCount(dayCount) : 0;

  const cells = useMemo(() => {
    if (!year || !month) return [];
    return buildDayGridCells(year, month);
  }, [year, month]);

  const summary = year && month ? dayPickerSummary(year, month) : null;

  if (!ready) {
    return (
      <div className={`erp-day-picker erp-day-picker--disabled ${className}`.trim()}>
        <p className="erp-day-picker-placeholder">Select year and month first</p>
      </div>
    );
  }

  return (
    <div className={`erp-day-picker ${className}`.trim()} role="group" aria-label={ariaLabel}>
      <div className="erp-day-picker-head">
        {summary ? <span className="erp-day-picker-summary">{summary}</span> : null}
        {!required ? (
          <button
            type="button"
            className={`erp-day-picker-clear${selectedDay ? "" : " is-hidden"}`}
            onClick={() => onChange(undefined)}
          >
            All dates
          </button>
        ) : null}
      </div>
      <div
        className="erp-day-picker-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((day, index) =>
          day === null ? (
            <span key={`empty-${index}`} className="erp-day-picker-cell erp-day-picker-cell--empty" aria-hidden />
          ) : (
            (() => {
              const dayDisabled =
                !year ||
                !month ||
                isCalendarDayBeforeMin(year, month, day, minDate);
              return (
            <button
              key={day}
              type="button"
              className={`erp-day-picker-cell${selectedDay === String(day) ? " is-selected" : ""}${dayDisabled ? " is-disabled" : ""}`}
              aria-pressed={selectedDay === String(day)}
              disabled={dayDisabled}
              onClick={() => {
                if (!year || !month || dayDisabled) return;
                const iso = buildIsoDate(year, month, day);
                if (required) {
                  onChange(iso);
                  return;
                }
                onChange(selectedDay === String(day) ? undefined : iso);
              }}
            >
              {day}
            </button>
              );
            })()
          )
        )}
      </div>
    </div>
  );
}

export { parseIsoDate, dayFromIsoDate };

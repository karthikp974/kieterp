import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildIsoDate, clampIsoDateToMin, parseIsoDate } from "./calendar-days";import { DayPickerGrid } from "./DayPickerGrid";
import { FormSelect } from "./FormSelect";
import { readPortalTheme, useOptionalPortalTheme } from "./portal-theme";

const MONTH_OPTIONS: [string, string][] = [
  ["1", "January"],
  ["2", "February"],
  ["3", "March"],
  ["4", "April"],
  ["5", "May"],
  ["6", "June"],
  ["7", "July"],
  ["8", "August"],
  ["9", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"]
];

export type PortalCustomDateRangeDraft = {
  dateFrom?: string;
  dateTo?: string;
  year?: number;
  month?: number;
};

export type PortalYearOption = { year: number; label: string; isOngoing?: boolean };

type Props = {
  open: boolean;
  title?: string;
  hint?: string;
  draft: PortalCustomDateRangeDraft;
  yearOptions: PortalYearOption[];
  onDraftChange: (next: PortalCustomDateRangeDraft) => void;
  onClose: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
};

function filterMonthOptions(
  year: number | undefined,
  minDate: string | undefined,
  required: boolean
): [string, string][] {
  const min = parseIsoDate(minDate);
  const emptyOption: [string, string][] = required ? [["", "Select month"]] : [];
  if (!year || !min) return [...emptyOption, ...MONTH_OPTIONS];
  if (year > min.year) return [...emptyOption, ...MONTH_OPTIONS];
  if (year === min.year) {
    return [...emptyOption, ...MONTH_OPTIONS.filter(([value]) => value === "" || Number(value) >= min.month)];
  }
  return emptyOption;
}

function CustomRangeSide({
  label,
  yearOptions,
  defaultYear,
  defaultMonth,
  value,
  disabled = false,
  required = false,
  minDate,
  onChange
}: {
  label: string;
  yearOptions: PortalYearOption[];
  defaultYear?: number;
  defaultMonth?: number;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  minDate?: string;
  onChange: (iso: string | undefined) => void;
}) {
  const minParts = parseIsoDate(minDate);
  const filteredYearOptions = useMemo(() => {
    if (!minParts) return yearOptions;
    return yearOptions.filter((row) => row.year >= minParts.year);
  }, [minParts, yearOptions]);

  const yearSelectOptions: [string, string][] = useMemo(
    () => [
      ["", "Select year"],
      ...filteredYearOptions.map((row) => [String(row.year), row.label] as [string, string])
    ],
    [filteredYearOptions]
  );

  const parts = parseIsoDate(value);
  const [sideYear, setSideYear] = useState(parts?.year ?? defaultYear);
  const [sideMonth, setSideMonth] = useState(parts?.month ?? defaultMonth);

  useEffect(() => {
    if (parts) {
      setSideYear(parts.year);
      setSideMonth(parts.month);
    }
  }, [value, parts?.month, parts?.year]);

  const year = parts?.year ?? sideYear;
  const month = parts?.month ?? sideMonth;

  const monthSelectOptions = useMemo(
    () => filterMonthOptions(year, minDate, required),
    [minDate, required, year]
  );

  useEffect(() => {
    if (!year || !month) return;
    const monthAllowed = monthSelectOptions.some(([v]) => v === String(month));
    if (!monthAllowed) {
      setSideMonth(undefined);
      if (value) onChange(undefined);
    }
  }, [month, monthSelectOptions, onChange, value, year]);

  useEffect(() => {
    if (!value || !minDate) return;
    if (value < minDate) onChange(undefined);
  }, [minDate, onChange, value]);

  function tryBuildDate(y: number | undefined, m: number | undefined, d: number | undefined) {
    if (!y || !m || !d) return undefined;
    if (minParts) {
      if (y < minParts.year) return undefined;
      if (y === minParts.year && m < minParts.month) return undefined;
    }
    const iso = buildIsoDate(y, m, d);
    return clampIsoDateToMin(iso, minDate);
  }

  return (    <div className="htpo-att-custom-range-side">
      <span className="db-field-label">{label}</span>
      <div className="htpo-att-custom-range-side__fields">
        <FormSelect
          aria-label={`${label} year`}
          value={year ? String(year) : ""}
          options={yearSelectOptions}
          disabled={disabled}
          required={required}
          onChange={(nextYear) => {
            const y = nextYear ? Number(nextYear) : undefined;
            setSideYear(y);
            if (y && month) {
              const next = tryBuildDate(y, month, parts?.day);
              onChange(next);
              if (!next) setSideMonth(undefined);
            } else if (value) {
              onChange(undefined);
            }
          }}
        />
        <FormSelect
          aria-label={`${label} month`}
          value={month ? String(month) : ""}
          options={monthSelectOptions}
          disabled={disabled || !year}
          required={required}
          onChange={(nextMonth) => {
            const m = nextMonth ? Number(nextMonth) : undefined;
            setSideMonth(m);
            if (year && m) {
              onChange(tryBuildDate(year, m, parts?.day));
            } else if (value) {
              onChange(undefined);
            }
          }}
        />
      </div>
      <DayPickerGrid
        year={year}
        month={month}
        value={value}
        disabled={disabled || !year || !month}
        required={required}
        minDate={minDate}
        onChange={onChange}
      />    </div>
  );
}

export function isPortalCustomRangeValid(draft: PortalCustomDateRangeDraft) {
  if (!draft.dateFrom || !draft.dateTo) return false;
  if (!parseIsoDate(draft.dateFrom) || !parseIsoDate(draft.dateTo)) return false;
  if (draft.dateFrom > draft.dateTo) return false;
  return true;
}

export function PortalCustomDateRangeModal({
  open,
  title = "Custom period",
  hint = "Select year, month, and day for both From and To. Same day is allowed.",
  draft,
  yearOptions,
  onDraftChange,
  onClose,
  onApply,
  applyDisabled
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    overlayRef.current?.scrollTo({ top: 0, left: 0 });
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [open]);

  if (!open) return null;

  const rangeInvalid = draft.dateFrom && draft.dateTo ? draft.dateFrom > draft.dateTo : false;
  const ongoingYear = yearOptions.find((row) => row.isOngoing)?.year ?? yearOptions[0]?.year;

  return createPortal(
    <div className="portal-root htpo-att-custom-portal-host" data-portal-theme={themeMode}>
      <div
        ref={overlayRef}
        className="htpo-att-custom-overlay"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
      <section
        className="htpo-att-custom-modal htpo-att-custom-modal--range"
        aria-modal="true"
        role="dialog"
        aria-labelledby="portal-custom-range-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="htpo-att-custom-modal__header">
          <h2 id="portal-custom-range-title">{title}</h2>
          <p className="htpo-att-custom-modal__hint">{hint}</p>
        </header>
        <div ref={scrollRef} className="htpo-att-custom-modal__scroll">
          <div className="htpo-att-custom-fields">
            <CustomRangeSide
              label="From"
              yearOptions={yearOptions}
              defaultYear={draft.year ?? ongoingYear}
              defaultMonth={draft.month}
              value={draft.dateFrom}
              required
              onChange={(dateFrom) =>
                onDraftChange({
                  ...draft,
                  year: parseIsoDate(dateFrom)?.year ?? draft.year,
                  month: parseIsoDate(dateFrom)?.month ?? draft.month,
                  dateFrom,
                  dateTo:
                    draft.dateTo && dateFrom && draft.dateTo < dateFrom ? undefined : clampIsoDateToMin(draft.dateTo, dateFrom)
                })
              }
            />
            <CustomRangeSide
              label="To"
              yearOptions={yearOptions}
              defaultYear={parseIsoDate(draft.dateFrom)?.year ?? draft.year ?? ongoingYear}
              defaultMonth={parseIsoDate(draft.dateFrom)?.month ?? draft.month}
              value={draft.dateTo}
              disabled={!parseIsoDate(draft.dateFrom)}
              required
              minDate={draft.dateFrom}
              onChange={(dateTo) => onDraftChange({ ...draft, dateTo })}
            />            {rangeInvalid ? (
              <p className="htpo-att-custom-modal__error" role="alert">
                End date must be on or after the start date.
              </p>
            ) : null}
          </div>
        </div>
        <div className="htpo-att-custom-actions">
          <button type="button" className="htpo-att-custom-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="htpo-att-custom-apply"
            disabled={applyDisabled ?? (!isPortalCustomRangeValid(draft) || rangeInvalid)}
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </section>
      </div>
    </div>,
    document.body
  );
}

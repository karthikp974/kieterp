import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IST_TIMEZONE, istDateParts } from "./ist-time";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseIso(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(`${y}-${pad(m)}-${pad(d)}T12:00:00+05:30`);
}

function formatDisplay(value: string | null | undefined) {
  const d = parseIso(value);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST_TIMEZONE });
}

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
};

export function ErpDateField({ value, onChange, disabled, id, className = "erp-date-field", placeholder = "Select date" }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    const p = istDateParts(base);
    return { year: p.year, month: p.month - 1 };
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const rows: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < startPad; i++) rows.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      rows.push({ day: d, iso: toIso(view.year, view.month, d) });
    }
    return rows;
  }, [view.month, view.year]);

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div ref={wrapRef} className={className}>
      <button
        type="button"
        id={id}
        className="erp-date-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <CalendarDays size={16} aria-hidden />
        <span className={value ? "erp-date-trigger-value" : "erp-date-trigger-placeholder"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>
      {open ? (
        <div className="erp-date-popover" role="dialog" aria-label="Choose date">
          <div className="erp-date-popover-head">
            <button
              type="button"
              className="erp-date-nav"
              aria-label="Previous month"
              onClick={() =>
                setView((v) => {
                  const m = v.month - 1;
                  return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m };
                })
              }
            >
              <ChevronLeft size={18} />
            </button>
            <span className="erp-date-month-label">{monthLabel}</span>
            <button
              type="button"
              className="erp-date-nav"
              aria-label="Next month"
              onClick={() =>
                setView((v) => {
                  const m = v.month + 1;
                  return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m };
                })
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="erp-date-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="erp-date-weekday">
                {w}
              </span>
            ))}
          </div>
          <div className="erp-date-grid">
            {cells.map((cell, i) =>
              cell.day === null ? (
                <span key={`e-${i}`} className="erp-date-cell erp-date-cell--empty" />
              ) : (
                <button
                  key={cell.iso!}
                  type="button"
                  className={`erp-date-cell${value === cell.iso ? " erp-date-cell--selected" : ""}`}
                  onClick={() => {
                    onChange(cell.iso!);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

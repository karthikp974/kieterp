import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { SectionTimetableGridCell, SectionTimetableGridDay, SectionTimetableGridRow, SectionTimetableOccupiedCell } from "./section-timetable-grid.types";

function cellVisible(cell: SectionTimetableGridCell, showTheory: boolean, showLab: boolean, showExam: boolean) {
  if (cell.kind === "free") return true;
  if (cell.slotType === "LAB") return showLab;
  if (cell.slotType === "EXAM") return showExam;
  return showTheory;
}

function rowHasOccupiedSlots(row: SectionTimetableGridRow) {
  return row.cells.some((cell) => cell.kind === "occupied");
}

function periodKey(row: Pick<SectionTimetableGridRow, "startTime" | "endTime">) {
  return `${row.startTime}\u0000${row.endTime}`;
}

function slotDetail(cell: SectionTimetableOccupiedCell) {
  const code = cell.subjectCode?.trim();
  if (cell.slotType === "LAB") return code ? `${code} · Lab` : "Lab";
  if (cell.slotType === "EXAM") return code ? `${code} · Exam` : "Exam";
  return code ?? null;
}

function CellContent({
  cell,
  canEdit,
  archiving,
  onDelete
}: {
  cell: SectionTimetableOccupiedCell;
  canEdit: boolean;
  archiving: boolean;
  onDelete?: () => void;
}) {
  const detail = slotDetail(cell);
  return (
    <>
      {canEdit && onDelete ? (
        <button
          type="button"
          className="htpo-section-tt-cell-delete"
          aria-label={`Remove ${cell.subjectName} on ${cell.dayLabel}`}
          disabled={archiving}
          onClick={onDelete}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      ) : null}
      <div className="htpo-section-tt-cell-head">
        <p className="htpo-section-tt-cell-subject">{cell.subjectName}</p>
      </div>
      {detail ? <p className="htpo-section-tt-cell-room">{detail}</p> : null}
    </>
  );
}

type Props = {
  days: SectionTimetableGridDay[];
  rows: SectionTimetableGridRow[];
  canEdit?: boolean;
  /** Teacher: checkboxes only. Student: checkboxes + sample boxes. Key: read-only labels. */
  legendMode?: "filter" | "key" | "both";
  archivingSlotId?: string | null;
  archivingPeriodKey?: string | null;
  onDeleteSlot?: (cell: SectionTimetableOccupiedCell) => void;
  onDeletePeriod?: (row: SectionTimetableGridRow) => void;
};

const SLOT_TYPE_LEGEND = [
  { slotType: "lecture", label: "Theory", showKey: "theory" as const },
  { slotType: "lab", label: "Lab", showKey: "lab" as const },
  { slotType: "exam", label: "Exam", showKey: "exam" as const }
] as const;

export function SectionTimetableGridView({
  days,
  rows,
  canEdit = false,
  legendMode,
  archivingSlotId = null,
  archivingPeriodKey = null,
  onDeleteSlot,
  onDeletePeriod
}: Props) {
  const [showTheory, setShowTheory] = useState(true);
  const [showLab, setShowLab] = useState(true);
  const [showExam, setShowExam] = useState(true);

  const resolvedLegend = legendMode ?? (canEdit ? "filter" : "both");
  const useKeyLegend = resolvedLegend === "key";
  const useBothLegend = resolvedLegend === "both";
  const visibleTheory = useKeyLegend ? true : showTheory;
  const visibleLab = useKeyLegend ? true : showLab;
  const visibleExam = useKeyLegend ? true : showExam;

  const legendChecks = {
    theory: { checked: showTheory, onChange: setShowTheory },
    lab: { checked: showLab, onChange: setShowLab },
    exam: { checked: showExam, onChange: setShowExam }
  } as const;

  if (!rows.length) {
    return null;
  }

  return (
    <>
      <div className="htpo-section-tt-grid-wrap htpo-tt-table-scroll">
        <table className="htpo-section-tt-grid">
          <thead>
            <tr>
              <th className="htpo-section-tt-time-col" scope="col" />
              {days.map((day) => (
                <th key={day.dayOfWeek} scope="col" className="htpo-section-tt-day-col">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.startTime}-${row.endTime}`}>
                <th scope="row" className="htpo-section-tt-time-col">
                  <div className="htpo-section-tt-time-col-inner">
                    {canEdit && onDeletePeriod && rowHasOccupiedSlots(row) ? (
                      <button
                        type="button"
                        className="htpo-section-tt-time-delete"
                        aria-label={`Remove all slots for ${row.label}`}
                        disabled={archivingPeriodKey === periodKey(row) || Boolean(archivingSlotId)}
                        onClick={() => onDeletePeriod(row)}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    ) : null}
                    <span className="htpo-section-tt-time-label">{row.label}</span>
                  </div>
                </th>
                {row.cells.map((cell) => {
                  const visible = cellVisible(cell, visibleTheory, visibleLab, visibleExam);
                  const occupied = visible && cell.kind === "occupied";
                  return (
                    <td key={`${row.startTime}-${cell.dayOfWeek}`} className="htpo-section-tt-td">
                      {occupied ? (
                        <div className={`htpo-section-tt-cell htpo-section-tt-cell--${cell.slotType.toLowerCase()}`}>
                          <CellContent
                            cell={cell}
                            canEdit={canEdit}
                            archiving={archivingSlotId === cell.slotId}
                            onDelete={onDeleteSlot ? () => onDeleteSlot(cell) : undefined}
                          />
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {useKeyLegend ? (
        <div className="htpo-section-tt-legend htpo-section-tt-legend--key" role="list" aria-label="Slot types">
          {SLOT_TYPE_LEGEND.map((item) => (
            <div key={item.slotType} className="htpo-section-tt-legend-item htpo-section-tt-legend-item--key" role="listitem">
              <span
                className={`htpo-section-tt-legend-swatch htpo-section-tt-legend-swatch--${item.slotType}`}
                aria-hidden
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : useBothLegend ? (
        <div className="htpo-section-tt-legend htpo-section-tt-legend--both" role="group" aria-label="Slot type filters">
          {SLOT_TYPE_LEGEND.map((item) => {
            const check = legendChecks[item.showKey];
            return (
              <label key={item.slotType} className="htpo-section-tt-legend-item htpo-section-tt-legend-item--both">
                <input type="checkbox" checked={check.checked} onChange={(e) => check.onChange(e.target.checked)} />
                <span
                  className={`htpo-section-tt-legend-swatch htpo-section-tt-legend-swatch--${item.slotType}`}
                  aria-hidden
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="htpo-section-tt-legend" role="group" aria-label="Slot type filters">
          <label className="htpo-section-tt-legend-item">
            <input type="checkbox" checked={showTheory} onChange={(e) => setShowTheory(e.target.checked)} />
            <span>Theory</span>
          </label>
          <label className="htpo-section-tt-legend-item">
            <input type="checkbox" checked={showLab} onChange={(e) => setShowLab(e.target.checked)} />
            <span>Lab</span>
          </label>
          <label className="htpo-section-tt-legend-item">
            <input type="checkbox" checked={showExam} onChange={(e) => setShowExam(e.target.checked)} />
            <span>Exam</span>
          </label>
        </div>
      )}
    </>
  );
}

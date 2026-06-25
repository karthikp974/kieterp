import { SectionTimetableGridView } from "../shared/SectionTimetableGridView";
import type { SectionTimetableGridDay, SectionTimetableGridRow } from "../shared/section-timetable-grid.types";

type Props = {
  sectionLabel: string;
  days: SectionTimetableGridDay[];
  rows: SectionTimetableGridRow[];
};

/** Student section timetable — same grid as teacher portal, read-only (no delete). */
export function StudentSectionTimetableGrid({ sectionLabel, days, rows }: Props) {
  if (!rows.length) {
    return (
      <div className="htpo-section-tt-card">
        <p className="htpo-section-tt-empty">No timetable published for {sectionLabel} yet.</p>
      </div>
    );
  }

  return (
    <div className="htpo-section-tt-card">
      <SectionTimetableGridView days={days} rows={rows} legendMode="both" />
    </div>
  );
}

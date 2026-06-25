import type { SectionTimetableGridCell, SectionTimetableGridRow } from "../shared/section-timetable-grid.types";

export type HtpoTimetableSectionOption = {
  id: string;
  label: string;
};

export type HtpoTimetableGridCell = SectionTimetableGridCell;
export type HtpoTimetableGridRow = SectionTimetableGridRow;

export type HtpoSectionTimetableGrid = {
  section: {
    id: string;
    label: string;
    name: string;
    semesterNumber: number;
    scope: {
      campusId: string;
      programId: string;
      branchId: string;
      batchId: string;
      classId: string;
      sectionId: string;
    };
  };
  canEdit: boolean;
  days: { dayOfWeek: number; label: string }[];
  rows: HtpoTimetableGridRow[];
  subjects: { id: string; code: string; name: string; semesterNumber: number }[];
};

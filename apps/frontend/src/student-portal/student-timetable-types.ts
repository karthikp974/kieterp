import type { SectionTimetableGridDay, SectionTimetableGridRow } from "../shared/section-timetable-grid.types";
import { SectionTimetableGridView } from "../shared/SectionTimetableGridView";

export type StudentTimetableResponse = {
  student: { id: string; fullName: string; rollNumber: string };
  section: {
    id: string;
    name: string;
    code: string;
    classLabel: string;
    semesterNumber: number;
    batchCode: string;
    branchName: string;
    departmentName: string;
    campusName: string;
    label: string;
  };
  meta: { todayDayOfWeek: number; generatedAt: string };
  days: SectionTimetableGridDay[];
  rows: SectionTimetableGridRow[];
};

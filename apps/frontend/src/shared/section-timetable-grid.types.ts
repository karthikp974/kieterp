export type SectionTimetableGridDay = { dayOfWeek: number; label: string };

export type SectionTimetableSlotType = "LECTURE" | "LAB" | "EXAM";

export type SectionTimetableGridCell =
  | { dayOfWeek: number; dayLabel: string; kind: "free" }
  | {
      dayOfWeek: number;
      dayLabel: string;
      kind: "occupied";
      slotId: string;
      subjectId: string | null;
      subjectName: string;
      room: string | null;
      subjectCode: string | null;
      slotType: SectionTimetableSlotType;
      teacherName: string | null;
    };

export type SectionTimetableGridRow = {
  startTime: string;
  endTime: string;
  label: string;
  cells: SectionTimetableGridCell[];
};

export type SectionTimetableOccupiedCell = Extract<SectionTimetableGridCell, { kind: "occupied" }>;

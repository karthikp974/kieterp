import {
  formatTimeRange24Label,
  HTPO_SECTION_TIMETABLE_DAYS,
  HTPO_SECTION_TIMETABLE_PERIODS
} from "./timetable-grid.constants";
import { normalizeTimeTo24h } from "./normalize-timetable-time";

export type SectionTimetableSlotRow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: string | null;
  slotType: string;
  room: string | null;
  subject: { name: string; code: string } | null;
  teacherProfile: { user: { fullName: string } } | null;
};

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
      slotType: string;
      teacherName: string | null;
    };

export type SectionTimetableGridRow = {
  startTime: string;
  endTime: string;
  label: string;
  cells: SectionTimetableGridCell[];
};

function normalizeSlotRow(slot: SectionTimetableSlotRow): SectionTimetableSlotRow {
  return {
    ...slot,
    startTime: normalizeTimeTo24h(slot.startTime) ?? slot.startTime,
    endTime: normalizeTimeTo24h(slot.endTime) ?? slot.endTime
  };
}

function periodKey(startTime: string, endTime: string) {
  return `${startTime}\u0000${endTime}`;
}

function periodLabel(startTime: string, endTime: string) {
  return formatTimeRange24Label(startTime, endTime);
}

export function buildSectionTimetableGridRows(slots: SectionTimetableSlotRow[]): SectionTimetableGridRow[] {
  const normalizedSlots = slots.map(normalizeSlotRow);
  const periodMap = new Map<string, { startTime: string; endTime: string; label: string }>();
  const presetLabels = new Map(
    HTPO_SECTION_TIMETABLE_PERIODS.map((period) => [periodKey(period.startTime, period.endTime), period.label])
  );

  for (const slot of normalizedSlots) {
    const key = periodKey(slot.startTime, slot.endTime);
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: presetLabels.get(key) ?? periodLabel(slot.startTime, slot.endTime)
      });
    }
  }

  const periods = [...periodMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return periods.map((period) => ({
    startTime: period.startTime,
    endTime: period.endTime,
    label: period.label,
    cells: HTPO_SECTION_TIMETABLE_DAYS.map((day) => {
      const slot = normalizedSlots.find(
        (s) => s.dayOfWeek === day.dayOfWeek && s.startTime === period.startTime && s.endTime === period.endTime
      );
      if (!slot) {
        return { dayOfWeek: day.dayOfWeek, dayLabel: day.label, kind: "free" as const };
      }
      return {
        dayOfWeek: day.dayOfWeek,
        dayLabel: day.label,
        kind: "occupied" as const,
        slotId: slot.id,
        subjectId: slot.subjectId,
        subjectName: slot.subject?.name ?? "General",
        subjectCode: slot.subject?.code ?? null,
        room: slot.room?.trim() || null,
        slotType: slot.slotType,
        teacherName: slot.teacherProfile?.user.fullName ?? null
      };
    })
  }));
}

export const SECTION_TIMETABLE_DAYS = HTPO_SECTION_TIMETABLE_DAYS;

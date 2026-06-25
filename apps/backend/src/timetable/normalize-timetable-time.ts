/** Strict 24-hour clock: HH:mm (00:00–23:59). */
export const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const LEGACY_HM = /^(\d{1,2}):(\d{1,2})$/;
const LEGACY_H = /^(\d{1,2})$/;

/** Normalize legacy timetable values (e.g. `9:00`, `5`, `17:0`) to HH:mm. */
export function normalizeTimeTo24h(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (TIME_24H_PATTERN.test(trimmed)) {
    const [hour, minute] = trimmed.split(":");
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  const hm = LEGACY_HM.exec(trimmed);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    return null;
  }

  const hourOnly = LEGACY_H.exec(trimmed);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
    return null;
  }

  const parts = trimmed.split(":");
  if (parts.length === 3) {
    return normalizeTimeTo24h(`${parts[0]}:${parts[1]}`);
  }

  return null;
}

export function formatTime24Label(time: string): string {
  return normalizeTimeTo24h(time) ?? time;
}

export function formatTimeRange24Label(startTime: string, endTime: string): string {
  return `${formatTime24Label(startTime)}–${formatTime24Label(endTime)}`;
}

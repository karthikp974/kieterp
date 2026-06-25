/** 24h clock helpers for portal time pickers (HH:mm). */

/** Strict 24-hour clock: HH:mm (00:00–23:59). */
export const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const LEGACY_HM = /^(\d{1,2}):(\d{1,2})$/;
const LEGACY_H = /^(\d{1,2})$/;

export function normalizeTimeTo24h(value: string | undefined): string | null {
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

export function isValid24hTime(value: string | undefined): value is string {
  return Boolean(value && normalizeTimeTo24h(value));
}

export const TIME_HOUR_OPTIONS: readonly [string, string][] = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return [value, value] as [string, string];
});

export const TIME_MINUTE_OPTIONS: readonly [string, string][] = ["00", "15", "30", "45"].map(
  (minute) => [minute, minute] as [string, string]
);

export function parseTimeValue(value: string | undefined): { hour: string; minute: string } {
  const normalized = normalizeTimeTo24h(value ?? undefined);
  if (!normalized) {
    return { hour: "", minute: "" };
  }
  const [hour, minute] = normalized.split(":");
  return {
    hour: hour.padStart(2, "0"),
    minute: minute.padStart(2, "0")
  };
}

export function joinTimeValue(hour: string, minute: string): string {
  if (!hour || !minute) return "";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function formatTimeRangeLabel(startTime: string, endTime: string): string {
  return `${formatClockLabel(startTime)}–${formatClockLabel(endTime)}`;
}

/** Display time as 24-hour HH:mm (includes legacy stored values). */
export function formatClockLabel(time: string): string {
  return normalizeTimeTo24h(time) ?? time;
}

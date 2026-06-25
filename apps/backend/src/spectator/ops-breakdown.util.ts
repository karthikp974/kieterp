import { formatIstDate, istDateParts, istTodayStart, todayIstDate } from "../common/ist-time.util";

export type OpsBreakdownHour = {
  hour: number;
  label: string;
  count: number;
};

export type OpsBreakdownDay = {
  date: string;
  label: string;
  count: number;
  hours: OpsBreakdownHour[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDayLabel(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(`${isoDate}T12:00:00+05:30`);
  const weekday = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(date);
  const monthLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" }).format(date);
  const today = todayIstDate() === isoDate ? " · Today" : "";
  return `${weekday}, ${day} ${monthLabel} ${year}${today}`;
}

export function buildDayHourBreakdown(timestamps: Date[]): OpsBreakdownDay[] {
  const dayMap = new Map<string, Map<number, number>>();

  for (const at of timestamps) {
    const parts = istDateParts(at);
    const date = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    const hourMap = dayMap.get(date) ?? new Map<number, number>();
    hourMap.set(parts.hour, (hourMap.get(parts.hour) ?? 0) + 1);
    dayMap.set(date, hourMap);
  }

  return Array.from(dayMap.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, hourMap]) => {
      const hours = Array.from(hourMap.entries())
        .sort(([left], [right]) => right - left)
        .map(([hour, count]) => ({
          hour,
          label: `${pad2(hour)}:00 – ${pad2(hour)}:59 IST`,
          count
        }));

      return {
        date,
        label: formatDayLabel(date),
        count: hours.reduce((sum, row) => sum + row.count, 0),
        hours
      };
    });
}

export function istHourRange(isoDate: string, hour: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const start = new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:00:00+05:30`);
  const end = new Date(start.getTime() + 60 * 60 * 1000 - 1);
  return { start, end };
}

export function istTodayRange() {
  const start = istTodayStart();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end, date: formatIstDate(start) };
}

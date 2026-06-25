import { describe, expect, it } from "vitest";
import { buildDayHourBreakdown } from "./ops-breakdown.util";

describe("buildDayHourBreakdown", () => {
  it("groups timestamps by IST day and hour", () => {
    const rows = [
      new Date("2026-06-25T04:30:00+05:30"),
      new Date("2026-06-25T04:45:00+05:30"),
      new Date("2026-06-25T06:10:00+05:30")
    ];

    const breakdown = buildDayHourBreakdown(rows);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.date).toBe("2026-06-25");
    expect(breakdown[0]?.count).toBe(3);
    expect(breakdown[0]?.hours).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hour: 4, count: 2 }),
        expect.objectContaining({ hour: 6, count: 1 })
      ])
    );
  });
});

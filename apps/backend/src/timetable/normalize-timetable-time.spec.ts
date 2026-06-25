import { describe, expect, it } from "vitest";
import { formatTimeRange24Label, normalizeTimeTo24h } from "./normalize-timetable-time";

describe("normalizeTimeTo24h", () => {
  it("pads strict and legacy hour values", () => {
    expect(normalizeTimeTo24h("09:00")).toBe("09:00");
    expect(normalizeTimeTo24h("9:00")).toBe("09:00");
    expect(normalizeTimeTo24h("17:00")).toBe("17:00");
    expect(normalizeTimeTo24h("5")).toBe("05:00");
    expect(normalizeTimeTo24h("17:0")).toBe("17:00");
  });

  it("formats ranges for display", () => {
    expect(formatTimeRange24Label("9:00", "10:00")).toBe("09:00–10:00");
    expect(formatTimeRange24Label("5", "6")).toBe("05:00–06:00");
    expect(formatTimeRange24Label("17:00", "18:00")).toBe("17:00–18:00");
  });
});

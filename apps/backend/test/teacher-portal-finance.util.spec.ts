import { describe, expect, it } from "vitest";
import { istDateParts } from "../src/common/ist-time.util";
import {
  currentAcademicYearWindow,
  deriveFeeStatus,
  formatInrCompact,
  sanitizeExportFilename
} from "../src/portals/teacher-portal-finance.util";

describe("teacher-portal-finance.util", () => {
  it("derives fee status", () => {
    expect(deriveFeeStatus(1000, 0)).toBe("pending");
    expect(deriveFeeStatus(1000, 500)).toBe("partial");
    expect(deriveFeeStatus(1000, 1000)).toBe("paid");
  });

  it("formats compact INR", () => {
    expect(formatInrCompact(610000)).toBe("₹6.1L"); // lakhs for >= 1,00,000
    expect(formatInrCompact(213000)).toBe("₹2.1L"); // 2.13 lakh
    expect(formatInrCompact(21300)).toBe("₹21k"); // thousands below 1 lakh
    expect(formatInrCompact(500)).toBe("₹500");
  });

  it("builds academic year window from June", () => {
    const window = currentAcademicYearWindow(new Date("2026-08-01"));
    const start = istDateParts(window.start);
    expect(start.year).toBe(2026);
    expect(start.month).toBe(6);
  });

  it("sanitizes export filenames", () => {
    expect(sanitizeExportFilename("B.Tech AI · Sem 3 · A — All-statuses")).toContain("B.Tech");
  });
});

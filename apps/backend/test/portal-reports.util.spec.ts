import { describe, expect, it } from "vitest";
import { ResultEntryStatus } from "@prisma/client";
import { buildSectionReportFilename, computeSemesterSgpa, sgpaToGradeBadge } from "../src/reports/portal-reports.util";

describe("portal-reports.util", () => {
  it("computes semester SGPA from JNTUK grades and credits", () => {
    const sgpa = computeSemesterSgpa([
      { grade: "S", credits: 3, status: ResultEntryStatus.PASS },
      { grade: "A", credits: 3, status: ResultEntryStatus.PASS }
    ]);
    expect(sgpa).toBe(9.5);
  });

  it("maps SGPA to grade badge", () => {
    expect(sgpaToGradeBadge(9.6)).toBe("S");
    expect(sgpaToGradeBadge(8.6)).toBe("A");
    expect(sgpaToGradeBadge(4)).toBe("F");
  });

  it("builds section report filename", () => {
    const name = buildSectionReportFilename("CSE-A", "pdf");
    expect(name).toMatch(/^CSE-A_REPORT_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

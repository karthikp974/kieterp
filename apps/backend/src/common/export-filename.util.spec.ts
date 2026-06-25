import { describe, expect, it } from "vitest";
import { buildExportBasename, buildExportFilename, sanitizeExportSegment } from "./export-filename.util";

describe("export-filename.util", () => {
  it("sanitizes segments", () => {
    expect(sanitizeExportSegment("Top Performers")).toBe("Top_Performers");
    expect(sanitizeExportSegment("  Fee Collection!  ")).toBe("Fee_Collection");
  });

  it("builds standard basename", () => {
    expect(buildExportBasename("Reports", "TopPerformers", new Date("2026-06-08T12:00:00Z"))).toBe(
      "Reports_TopPerformers_2026-06-08"
    );
  });

  it("builds standard filenames per format", () => {
    const date = new Date("2026-06-08T12:00:00Z");
    expect(buildExportFilename("Attendance", "AttendanceSummary", "pdf", date)).toBe(
      "Attendance_AttendanceSummary_2026-06-08.pdf"
    );
    expect(buildExportFilename("Finance", "FeeCollection", "excel", date)).toBe(
      "Finance_FeeCollection_2026-06-08.xlsx"
    );
    expect(buildExportFilename("Feedback", "FeedbackAnalytics", "txt", date)).toBe(
      "Feedback_FeedbackAnalytics_2026-06-08.txt"
    );
    expect(buildExportFilename("Syllabus", "CompletionStatus", "google-sheets", date)).toBe(
      "Syllabus_CompletionStatus_2026-06-08.csv"
    );
  });
});

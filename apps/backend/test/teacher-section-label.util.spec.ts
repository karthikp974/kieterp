import { describe, expect, it } from "vitest";
import { formatTeacherSectionLabel, formatTeacherSectionSemDeptLabel } from "../src/common/teacher-section-label.util";

describe("formatTeacherSectionLabel", () => {
  it("shows section name first with department in parentheses", () => {
    expect(
      formatTeacherSectionLabel({
        name: "A",
        class: { batch: { branch: { program: { name: "BTech" } } } }
      })
    ).toBe("A (B.Tech)");
  });

  it("normalizes B.Tech program names", () => {
    expect(
      formatTeacherSectionLabel({
        name: "B",
        class: { batch: { branch: { program: { name: "B.Tech Artificial Intelligence" } } } }
      })
    ).toBe("B (B.Tech Artificial Intelligence)");
  });
});

describe("formatTeacherSectionSemDeptLabel", () => {
  it("formats section name with semester and department code", () => {
    expect(
      formatTeacherSectionSemDeptLabel({
        name: "A",
        class: { semesterNumber: 3, batch: { branch: { program: { code: "BTECH" } } } }
      })
    ).toBe("A · Sem 3 · BTECH");
  });
});

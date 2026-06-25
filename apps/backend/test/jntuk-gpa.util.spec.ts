import { describe, expect, it } from "vitest";
import { ResultEntryStatus } from "@prisma/client";
import {
  computeJntukCgpa,
  computeJntukSemesterSgpa,
  jntukCgpaToPercentage,
  jntukGradePoints
} from "../src/common/jntuk-gpa.util";

describe("jntuk-gpa.util", () => {
  it("maps R23 letter grades to grade points", () => {
    expect(jntukGradePoints("S", ResultEntryStatus.PASS)).toBe(10);
    expect(jntukGradePoints("A", ResultEntryStatus.PASS)).toBe(9);
    expect(jntukGradePoints("B", ResultEntryStatus.PASS)).toBe(8);
    expect(jntukGradePoints("E", ResultEntryStatus.PASS)).toBe(5);
    expect(jntukGradePoints("F", ResultEntryStatus.FAIL)).toBe(0);
    expect(jntukGradePoints("Ab", ResultEntryStatus.ABSENT)).toBe(0);
  });

  it("computes semester SGPA including failed subjects (zero grade points)", () => {
    const sgpa = computeJntukSemesterSgpa([
      { grade: "A", credits: 3, status: ResultEntryStatus.PASS },
      { grade: "F", credits: 3, status: ResultEntryStatus.FAIL }
    ]);
    expect(sgpa).toBe(4.5);
  });

  it("computes CGPA as credit-weighted semester SGPAs", () => {
    const cgpa = computeJntukCgpa([
      { grade: "A", credits: 4, status: ResultEntryStatus.PASS, semesterNumber: 1 },
      { grade: "A", credits: 4, status: ResultEntryStatus.PASS, semesterNumber: 1 },
      { grade: "D", credits: 4, status: ResultEntryStatus.PASS, semesterNumber: 2 },
      { grade: "D", credits: 4, status: ResultEntryStatus.PASS, semesterNumber: 2 }
    ]);
    // Sem1 SGPA 9 (8 credits), Sem2 SGPA 6 (8 credits) → CGPA (9*8 + 6*8)/16 = 7.5
    expect(cgpa).toBe(7.5);
  });

  it("converts CGPA to percentage (R16+ formula)", () => {
    expect(jntukCgpaToPercentage(7.03)).toBe(62.8);
  });
});

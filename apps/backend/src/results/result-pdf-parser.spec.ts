import { ResultEntryStatus } from "@prisma/client";
import { parseResultRows } from "./result-pdf-parser";

describe("parseResultRows", () => {
  it("parses JNTUK-style rows with htno, subcode, internals, grade, and credits", () => {
    const text = [
      "1 17B21A0372 R161210 ENGINEERING DRAWING 25 F 0",
      "2 17B21A0479 R161203 MATHEMATICS - III 19 C 3",
      "3 18B21A0125 R161202 APPLIED CHEMISTRY 18 ABSENT 3"
    ].join("\n");

    const rows = parseResultRows(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rollNumber: "17B21A0372",
      subjectCode: "R161210",
      subjectName: "ENGINEERING DRAWING",
      internals: 25,
      grade: "F",
      credits: 0,
      status: ResultEntryStatus.FAIL
    });
    expect(rows[1]).toMatchObject({
      rollNumber: "17B21A0479",
      subjectCode: "R161203",
      internals: 19,
      grade: "C",
      credits: 3,
      status: ResultEntryStatus.PASS
    });
    expect(rows[2]).toMatchObject({
      rollNumber: "18B21A0125",
      grade: "ABSENT",
      status: ResultEntryStatus.ABSENT
    });
  });
});

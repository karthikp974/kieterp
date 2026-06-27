import { describe, expect, it } from "vitest";
import { computeFeeOverdue } from "./fee-overdue.util";

const now = new Date("2026-06-27T06:00:00+05:30");
const due = (s: string) => new Date(`${s}T00:00:00+05:30`);

describe("computeFeeOverdue", () => {
  it("is paid when nothing is outstanding", () => {
    expect(computeFeeOverdue(0, due("2026-01-01"), now)).toEqual({ status: "paid", daysOverdue: 0 });
    expect(computeFeeOverdue(-5, null, now)).toEqual({ status: "paid", daysOverdue: 0 });
  });

  it("is overdue when outstanding and past the due date", () => {
    expect(computeFeeOverdue(1000, due("2026-06-15"), now)).toEqual({ status: "overdue", daysOverdue: 12 });
  });

  it("is pending when outstanding but not yet due (due today counts as not overdue)", () => {
    expect(computeFeeOverdue(1000, due("2026-06-27"), now)).toEqual({ status: "pending", daysOverdue: 0 });
    expect(computeFeeOverdue(1000, due("2026-07-10"), now)).toEqual({ status: "pending", daysOverdue: 0 });
  });

  it("is pending when outstanding with no due date", () => {
    expect(computeFeeOverdue(1000, null, now)).toEqual({ status: "pending", daysOverdue: 0 });
  });
});

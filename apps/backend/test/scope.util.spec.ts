import { describe, expect, it } from "vitest";
import { pickScopeRef, scopeContains } from "../src/permissions/scope.util";

describe("scopeContains", () => {
  it("rejects conflicting section scope for CTPO", () => {
    expect(scopeContains({ sectionId: "section-a" }, { sectionId: "section-b" })).toBe(false);
  });

  it("requires an explicit boundary match", () => {
    expect(scopeContains({ branchId: "csc" }, { sectionId: "section-a" })).toBe(false);
  });

  it("matches shared campus and branch boundaries", () => {
    expect(
      scopeContains(
        { campusId: "kiet", branchId: "csc" },
        { campusId: "kiet", branchId: "csc", sectionId: "section-a" }
      )
    ).toBe(true);
  });

  it("allows a campus-scoped assignment when the shared-group request targets the same campus", () => {
    // Student in a GROUP_SHARED program carries campusGroupId; teacher is assigned by campusId only.
    expect(
      scopeContains(
        { campusId: "kiet", programId: "p1", branchId: "csc" },
        { campusId: "kiet", campusGroupId: "kiet-kiek", programId: "p1", branchId: "csc", sectionId: "sec-a", subjectId: "sub-1" }
      )
    ).toBe(true);
  });

  it("still rejects a campus-only assignment for a group-wide request (no specific campus)", () => {
    expect(scopeContains({ campusId: "kiet" }, { campusGroupId: "kiet-kiek", branchId: "csc" })).toBe(false);
  });

  it("still rejects a campus-only assignment when the request targets a different campus in the group", () => {
    expect(
      scopeContains(
        { campusId: "kiet", branchId: "csc" },
        { campusId: "kiek", campusGroupId: "kiet-kiek", branchId: "csc", sectionId: "sec-a" }
      )
    ).toBe(false);
  });
});

describe("pickScopeRef", () => {
  it("ignores non-scope body fields such as result rows", () => {
    expect(
      pickScopeRef({
        sectionId: "section-a",
        semesterNumber: 3,
        rows: [{ subjectCode: "CS301" }]
      } as never)
    ).toEqual({ sectionId: "section-a" });
  });
});

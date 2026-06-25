import { describe, expect, it } from "vitest";
import { pickSubjectForBranch, resolveResultSubjectByCode } from "../src/results/results-subject.util";

describe("pickSubjectForBranch", () => {
  it("prefers exact semester match", () => {
    const picked = pickSubjectForBranch(
      [
        { id: "a", branchId: "b1", semesterNumber: 2 },
        { id: "b", branchId: "b1", semesterNumber: 3 }
      ],
      "b1",
      3
    );
    expect(picked?.id).toBe("b");
  });
});

describe("resolveResultSubjectByCode", () => {
  it("returns subject with catalog semester for branch", async () => {
    const subject = {
      id: "sub-1",
      branchId: "branch-a",
      semesterNumber: 2,
      code: "CS101",
      name: "Data Structures"
    };
    const db = {
      subject: {
        findFirst: async () => subject
      }
    };

    const resolved = await resolveResultSubjectByCode(db, { branchId: "branch-a", subjectCode: "cs101" });
    expect(resolved).toEqual(subject);
    expect(resolved.semesterNumber).toBe(2);
  });

  it("rejects unknown subject codes", async () => {
    const db = {
      subject: {
        findFirst: async () => null
      }
    };

    await expect(resolveResultSubjectByCode(db, { branchId: "branch-a", subjectCode: "MISSING" })).rejects.toThrow(
      /not in the catalog/i
    );
  });

  it("rejects subject codes from another branch", async () => {
    const db = {
      subject: {
        findFirst: async () => ({
          id: "sub-1",
          branchId: "branch-b",
          semesterNumber: 1,
          code: "CS101",
          name: "Physics"
        })
      }
    };

    await expect(resolveResultSubjectByCode(db, { branchId: "branch-a", subjectCode: "CS101" })).rejects.toThrow(
      /another branch/i
    );
  });
});

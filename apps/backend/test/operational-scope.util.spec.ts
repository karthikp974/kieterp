import { describe, expect, it } from "vitest";
import { ProgramStructureScope } from "@prisma/client";
import { campusIdsForSharedMatching, studentProfileToScope, sectionTreeToScope } from "../src/permissions/operational-scope.util";

function mockStudent(
  operationalCampusId: string,
  structureCampusId: string,
  structureScope: ProgramStructureScope = ProgramStructureScope.GROUP_SHARED
) {
  return {
    sectionId: "sec-1",
    user: { campusId: operationalCampusId, campus: { groupId: "grp-1" } },
    section: {
      id: "sec-1",
      classId: "cls-1",
      class: {
        id: "cls-1",
        batchId: "bat-1",
        batch: {
          branchId: "br-1",
          branch: {
            id: "br-1",
            programId: "prog-1",
            program: {
              campusId: structureCampusId,
              structureScope,
              campus: { groupId: "grp-1" }
            }
          }
        }
      }
    }
  };
}

describe("operational-scope.util", () => {
  it("omits campusId on shared-group student scope (KIET+KIEK match by group + section)", () => {
    const scope = studentProfileToScope(mockStudent("kiek-id", "kiet-id"));
    expect(scope.campusId).toBeUndefined();
    expect(scope.campusGroupId).toBe("grp-1");
    expect(scope.sectionId).toBe("sec-1");
  });

  it("keeps operational campusId on campus-owned student scope (MBA/MCA, KIEW)", () => {
    const scope = studentProfileToScope(mockStudent("kiew-id", "kiew-id", ProgramStructureScope.CAMPUS_OWNED));
    expect(scope.campusId).toBe("kiew-id");
    expect(scope.campusGroupId).toBe("grp-1");
    expect(scope.sectionId).toBe("sec-1");
  });

  it("returns both operational and structure campus for shared matching", () => {
    const ids = campusIdsForSharedMatching(mockStudent("kiek-id", "kiet-id"));
    expect(ids).toContain("kiek-id");
    expect(ids).toContain("kiet-id");
  });

  it("omits campusId on shared section scope when operational campus unknown", () => {
    const scope = sectionTreeToScope(mockStudent("kiek-id", "kiet-id").section);
    expect(scope.campusId).toBeUndefined();
    expect(scope.sectionId).toBe("sec-1");
  });
});

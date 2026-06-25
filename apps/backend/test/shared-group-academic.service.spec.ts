import { CampusIsolationPolicy, ProgramStructureScope, StructureStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { SharedGroupAcademicService } from "../src/permissions/shared-group-academic.service";

describe("SharedGroupAcademicService", () => {
  const service = new SharedGroupAcademicService({} as never);

  const kietCampus = {
    id: "kiet-id",
    code: "KIET",
    groupId: "group-1",
    status: StructureStatus.ACTIVE,
    group: { isolationPolicy: CampusIsolationPolicy.SHARED }
  };

  const kiekCampus = {
    id: "kiek-id",
    code: "KIEK",
    groupId: "group-1",
    status: StructureStatus.ACTIVE,
    group: { isolationPolicy: CampusIsolationPolicy.SHARED }
  };

  const sharedBtech = {
    campusId: "kiet-id",
    code: "BTECH",
    structureScope: ProgramStructureScope.GROUP_SHARED,
    campus: { groupId: "group-1" }
  };

  it("allows KIEK student on KIET-owned shared section", () => {
    expect(() => service.assertStudentOperationalCampusMatchesSection(sharedBtech, kiekCampus)).not.toThrow();
  });

  it("rejects KIEK student on KIET MBA program", () => {
    expect(() =>
      service.assertStudentOperationalCampusMatchesSection(
        { ...sharedBtech, code: "MBA", structureScope: ProgramStructureScope.CAMPUS_OWNED },
        kiekCampus
      )
    ).toThrow();
  });

  it("allows teacher assignment campus KIEK with KIET shared program", () => {
    expect(() => service.assertOperationalCampusMatchesStructure(sharedBtech, kiekCampus)).not.toThrow();
  });
});

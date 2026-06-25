/**
 * Shared-group (KIET+KIEK) vs isolated (KIEW) results-upload authorization.
 * KIET/KIEK teachers may upload for any KIET/KIEK student in the same shared section;
 * KIEW stays isolated and needs its own assignment.
 */
import { describe, expect, it } from "vitest";
import { PermissionAction, ProgramStructureScope, UserType } from "@prisma/client";
import { PermissionsService } from "../src/permissions/permissions.service";
import { studentProfileToScope } from "../src/permissions/operational-scope.util";

const svc = new PermissionsService();

// Shared group (KIET+KIEK) and isolated KIEW group
const G_SHARED = "grp-kiet-kiek";
const G_KIEW = "grp-kiew";

function teacher(campusId: string, campusGroupId: string, assignmentCampus: string, branchId: string) {
  return {
    id: "t1",
    type: UserType.TEACHER,
    campusId,
    campusGroupId,
    assignments: [
      { role: "HTPO", campusId: assignmentCampus, programId: "p-btech", branchId, permissions: [] }
    ]
  } as any;
}

// Build a student-scope request the same way the results importer does
function studentScope(operationalCampusId: string, groupId: string, branchId: string, structureScope: ProgramStructureScope) {
  return studentProfileToScope(
    {
      sectionId: "sec-a",
      user: { campusId: operationalCampusId, campus: { groupId } },
      section: {
        id: "sec-a",
        classId: "cls-1",
        class: {
          id: "cls-1",
          batchId: "bat-1",
          batch: { branchId, branch: { id: branchId, programId: "p-btech", program: { campusId: "kiet", structureScope, campus: { groupId } } } }
        }
      }
    } as any,
    "subj-1"
  );
}

const kietTeacher = teacher("kiet", G_SHARED, "kiet", "csc");
const kiekTeacher = teacher("kiek", G_SHARED, "kiek", "csc");
const kiewTeacher = teacher("kiew", G_KIEW, "kiew", "csaiml");

const kietStudent = studentScope("kiet", G_SHARED, "csc", ProgramStructureScope.GROUP_SHARED);
const kiekStudent = studentScope("kiek", G_SHARED, "csc", ProgramStructureScope.GROUP_SHARED);
const kiewStudent = studentScope("kiew", G_KIEW, "csaiml", ProgramStructureScope.CAMPUS_OWNED);

function can(user: any, scope: any) {
  return svc.can(user, { action: PermissionAction.UPLOAD_RESULTS, scope }).allowed;
}

describe("shared-group results upload", () => {
  it("KIET teacher -> KIET student (shared)", () => expect(can(kietTeacher, kietStudent)).toBe(true));
  it("KIET teacher -> KIEK student (shared, same section)", () => expect(can(kietTeacher, kiekStudent)).toBe(true));
  it("KIEK teacher -> KIET student (shared)", () => expect(can(kiekTeacher, kietStudent)).toBe(true));
  it("KIET teacher -> KIEW student (isolated) DENIED", () => expect(can(kietTeacher, kiewStudent)).toBe(false));
  it("KIEW teacher -> KIEW student", () => expect(can(kiewTeacher, kiewStudent)).toBe(true));
  it("KIEW teacher -> KIET student DENIED", () => expect(can(kiewTeacher, kietStudent)).toBe(false));
});

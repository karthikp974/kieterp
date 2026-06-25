import { PermissionAction, TeacherRoleKind, UserType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AuthUser } from "../src/auth/auth.types";
import { formMatchesSectionIds, resolveTeacherEngageContext } from "../src/portals/teacher-portal-section-scope.util";
import { PermissionsService } from "../src/permissions/permissions.service";

const permissions = new PermissionsService();

function teacher(assignments: { role: TeacherRoleKind; sectionId?: string; branchId?: string }[]): AuthUser {
  return {
    id: "teacher-1",
    type: UserType.TEACHER,
    campusId: "kiet",
    campusGroupId: "kiet-kiek",
    sessionId: "session-1",
    email: "teacher@test",
    fullName: "Teacher Test",
    auditUserId: "teacher-1",
    assignments: assignments.map((a, index) => ({
      id: `assignment-${index}`,
      role: a.role,
      campusGroupId: "kiet-kiek",
      campusId: "kiet",
      sectionId: a.sectionId,
      branchId: a.branchId,
      permissions: [] as PermissionAction[]
    }))
  };
}

function teacherProfile(user: AuthUser) {
  return {
    assignments: user.assignments.map((a) => ({
      role: a.role,
      campusId: a.campusId ?? null,
      programId: a.programId ?? null,
      branchId: a.branchId ?? null,
      sectionId: a.sectionId ?? null
    }))
  };
}

describe("teacher-portal-section-scope.util", () => {
  it("unions HTPO and CTPO sections and shows filter for HTPO", () => {
    const user = teacher([
      { role: TeacherRoleKind.HTPO, branchId: "csc" },
      { role: TeacherRoleKind.CTPO, sectionId: "section-b" }
    ]);
    const sections = [
      { id: "section-a", label: "A", name: "A" },
      { id: "section-b", label: "B", name: "B" }
    ];
    const ctx = resolveTeacherEngageContext(user, permissions, teacherProfile(user), sections);
    expect(ctx.showSectionFilter).toBe(true);
    expect(ctx.sectionIds).toEqual(["section-a", "section-b"]);
  });

  it("rejects tampered sectionId outside assigned scope", () => {
    const user = teacher([{ role: TeacherRoleKind.CTPO, sectionId: "section-a" }]);
    const sections = [{ id: "section-a", label: "A", name: "A" }];
    expect(() =>
      resolveTeacherEngageContext(user, permissions, teacherProfile(user), sections, "section-z")
    ).toThrow("You cannot access data for this section.");
  });

  it("fixes CTPO to assigned section without dropdown", () => {
    const user = teacher([{ role: TeacherRoleKind.CTPO, sectionId: "section-a" }]);
    const sections = [{ id: "section-a", label: "A", name: "A" }];
    const ctx = resolveTeacherEngageContext(user, permissions, teacherProfile(user), sections);
    expect(ctx.showSectionFilter).toBe(false);
    expect(ctx.fixedSectionId).toBe("section-a");
    expect(ctx.sectionIds).toEqual(["section-a"]);
  });

  it("matches feedback forms only on exact sectionId", () => {
    expect(formMatchesSectionIds({ sectionId: "section-a" }, ["section-a"])).toBe(true);
    expect(formMatchesSectionIds({ sectionId: "section-a" }, ["section-b"])).toBe(false);
    expect(formMatchesSectionIds({ sectionId: null }, ["section-a"])).toBe(false);
  });
});

describe("STPO portal modules", () => {
  it("does not grant STPO announcements or feedback access", () => {
    const stpo = teacher([{ role: TeacherRoleKind.STPO, sectionId: "section-a" }]);
    expect(permissions.can(stpo, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed).toBe(false);
    expect(permissions.can(stpo, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed).toBe(false);
    expect(permissions.can(stpo, { action: PermissionAction.MANAGE_FEEDBACK }).allowed).toBe(false);
    expect(permissions.can(stpo, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed).toBe(false);
  });
});

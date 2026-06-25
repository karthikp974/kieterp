import { PermissionAction, TeacherRoleKind, UserType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PermissionsService } from "../src/permissions/permissions.service";
import { PermissionSubject } from "../src/permissions/permission.types";

const service = new PermissionsService();

function teacher(assignments: PermissionSubject["assignments"]): PermissionSubject {
  return {
    id: "teacher-1",
    type: UserType.TEACHER,
    campusId: "kiet",
    campusGroupId: "kiet-kiek",
    assignments
  };
}

describe("PermissionsService", () => {
  it("allows admin to access every portal including DB portal", () => {
    const decision = service.can(
      { id: "admin-1", type: UserType.ADMIN, assignments: [] },
      { action: PermissionAction.VIEW_DB_PORTAL }
    );

    expect(decision.allowed).toBe(true);
  });

  it("allows a CTPO to manage only the assigned section", () => {
    const user = teacher([
      {
        id: "assignment-1",
        role: TeacherRoleKind.CTPO,
        campusGroupId: "kiet-kiek",
        campusId: "kiet",
        sectionId: "section-a",
        permissions: []
      }
    ]);

    expect(service.can(user, { action: PermissionAction.MANAGE_TEAMS, scope: { sectionId: "section-a" } }).allowed).toBe(
      true
    );
    expect(service.can(user, { action: PermissionAction.MANAGE_TEAMS, scope: { sectionId: "section-b" } }).allowed).toBe(
      false
    );
  });

  it("allows one teacher to act through multiple role assignments", () => {
    const user = teacher([
      {
        id: "ctpo",
        role: TeacherRoleKind.CTPO,
        sectionId: "section-a",
        permissions: []
      },
      {
        id: "htpo",
        role: TeacherRoleKind.HTPO,
        branchId: "ai-ml",
        permissions: []
      },
      {
        id: "stpo",
        role: TeacherRoleKind.STPO,
        subjectId: "dbms",
        permissions: []
      }
    ]);

    expect(service.can(user, { action: PermissionAction.MARK_FEES, scope: { sectionId: "section-a" } }).allowed).toBe(
      true
    );
    expect(service.can(user, { action: PermissionAction.UPLOAD_RESULTS, scope: { branchId: "ai-ml" } }).allowed).toBe(
      true
    );
    expect(service.can(user, { action: PermissionAction.MANAGE_TIMETABLE, scope: { subjectId: "dbms" } }).allowed).toBe(
      false
    );
    expect(service.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed).toBe(true);
  });

  it("allows HTPO and CTPO to manage feedback; STPO has no engage access", () => {
    const htpo = teacher([{ id: "htpo", role: TeacherRoleKind.HTPO, branchId: "csc", permissions: [] }]);
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);
    const stpo = teacher([{ id: "stpo", role: TeacherRoleKind.STPO, subjectId: "dbms", permissions: [] }]);

    expect(service.can(htpo, { action: PermissionAction.MANAGE_FEEDBACK }).allowed).toBe(true);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_FEEDBACK }).allowed).toBe(true);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_FEEDBACK }).allowed).toBe(false);
    expect(service.can(stpo, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed).toBe(false);
    expect(service.can(stpo, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed).toBe(false);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed).toBe(false);
  });

  it("blocks KIET/KIEK users from KIEW scoped data", () => {
    const user = teacher([
      {
        id: "assignment-1",
        role: TeacherRoleKind.HTPO,
        campusGroupId: "kiet-kiek",
        permissions: []
      }
    ]);

    const decision = service.can(user, {
      action: PermissionAction.VIEW_STUDENTS,
      scope: { campusGroupId: "kiew" }
    });

    expect(decision.allowed).toBe(false);
  });

  it("does not allow students to enter teacher or database portal", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };

    expect(service.can(student, { action: PermissionAction.VIEW_STUDENT_PORTAL }).allowed).toBe(true);
    expect(service.can(student, { action: PermissionAction.VIEW_TEACHER_PORTAL }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.VIEW_DB_PORTAL }).allowed).toBe(false);
  });

  it("blocks students from admin attendance and fee actions", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };

    expect(service.can(student, { action: PermissionAction.VIEW_ATTENDANCE }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.MARK_ATTENDANCE }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.VIEW_FEES }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.MARK_FEES }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.VIEW_RESULTS }).allowed).toBe(false);
  });

  it("allows STPO to mark attendance only within assigned subject scope", () => {
    const user = teacher([
      {
        id: "stpo",
        role: TeacherRoleKind.STPO,
        sectionId: "section-a",
        subjectId: "dbms",
        permissions: []
      }
    ]);

    expect(
      service.can(user, {
        action: PermissionAction.MARK_ATTENDANCE,
        scope: { sectionId: "section-a", subjectId: "dbms" }
      }).allowed
    ).toBe(true);
    expect(
      service.can(user, {
        action: PermissionAction.MARK_ATTENDANCE,
        scope: { sectionId: "section-a", subjectId: "maths" }
      }).allowed
    ).toBe(false);
  });

  it("allows HTPO and CTPO to manage timetable within assigned scope", () => {
    const htpo = teacher([
      {
        id: "htpo",
        role: TeacherRoleKind.HTPO,
        sectionId: "section-a",
        permissions: []
      }
    ]);
    const ctpo = teacher([
      {
        id: "ctpo",
        role: TeacherRoleKind.CTPO,
        sectionId: "section-a",
        permissions: []
      }
    ]);
    const stpo = teacher([
      {
        id: "stpo",
        role: TeacherRoleKind.STPO,
        sectionId: "section-a",
        subjectId: "dbms",
        permissions: []
      }
    ]);

    expect(service.can(htpo, { action: PermissionAction.MANAGE_TIMETABLE, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_TIMETABLE, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_TIMETABLE, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });

  it("allows students to view results and HTPO/CTPO to upload results", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };
    const htpo = teacher([{ id: "htpo", role: TeacherRoleKind.HTPO, sectionId: "section-a", permissions: [] }]);
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);
    const stpo = teacher([{ id: "stpo", role: TeacherRoleKind.STPO, sectionId: "section-a", subjectId: "dbms", permissions: [] }]);

    expect(service.can(student, { action: PermissionAction.VIEW_RESULTS }).allowed).toBe(false);
    expect(service.can(student, { action: PermissionAction.VIEW_STUDENT_PORTAL }).allowed).toBe(true);
    expect(service.can(student, { action: PermissionAction.UPLOAD_RESULTS }).allowed).toBe(false);
    expect(service.can(htpo, { action: PermissionAction.UPLOAD_RESULTS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(ctpo, { action: PermissionAction.UPLOAD_RESULTS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(stpo, { action: PermissionAction.UPLOAD_RESULTS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });

  it("allows students to view applications but not teacher portal roles", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);
    const htpo = teacher([{ id: "htpo", role: TeacherRoleKind.HTPO, branchId: "csc", permissions: [] }]);
    const stpo = teacher([{ id: "stpo", role: TeacherRoleKind.STPO, subjectId: "dbms", permissions: [] }]);

    expect(service.can(student, { action: PermissionAction.VIEW_APPLICATIONS }).allowed).toBe(true);
    expect(service.can(student, { action: PermissionAction.MANAGE_APPLICATIONS }).allowed).toBe(false);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_APPLICATIONS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(htpo, { action: PermissionAction.MANAGE_APPLICATIONS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_APPLICATIONS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });

  it("allows students to view announcements and CTPO to manage scoped announcements", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);
    const stpo = teacher([{ id: "stpo", role: TeacherRoleKind.STPO, sectionId: "section-a", subjectId: "dbms", permissions: [] }]);

    expect(service.can(student, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed).toBe(true);
    expect(service.can(student, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed).toBe(false);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_ANNOUNCEMENTS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_ANNOUNCEMENTS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });

  it("allows teachers to view scoped reports and students cannot view reports", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);

    expect(service.can(student, { action: PermissionAction.VIEW_REPORTS }).allowed).toBe(false);
    expect(service.can(ctpo, { action: PermissionAction.VIEW_REPORTS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(ctpo, { action: PermissionAction.VIEW_REPORTS, scope: { sectionId: "section-b" } }).allowed).toBe(false);
  });

  it("allows only admin to manage promotions", () => {
    const admin: PermissionSubject = { id: "admin-1", type: UserType.ADMIN, assignments: [] };
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);

    expect(service.can(admin, { action: PermissionAction.MANAGE_PROMOTIONS }).allowed).toBe(true);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_PROMOTIONS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });

  it("allows students to view teams and CTPO to manage scoped teams", () => {
    const student: PermissionSubject = {
      id: "student-1",
      type: UserType.STUDENT,
      campusId: "kiet",
      campusGroupId: "kiet-kiek",
      assignments: []
    };
    const ctpo = teacher([{ id: "ctpo", role: TeacherRoleKind.CTPO, sectionId: "section-a", permissions: [] }]);
    const stpo = teacher([{ id: "stpo", role: TeacherRoleKind.STPO, sectionId: "section-a", subjectId: "dbms", permissions: [] }]);

    expect(service.can(student, { action: PermissionAction.VIEW_TEAMS }).allowed).toBe(true);
    expect(service.can(student, { action: PermissionAction.MANAGE_TEAMS }).allowed).toBe(false);
    expect(service.can(ctpo, { action: PermissionAction.MANAGE_TEAMS, scope: { sectionId: "section-a" } }).allowed).toBe(true);
    expect(service.can(stpo, { action: PermissionAction.MANAGE_TEAMS, scope: { sectionId: "section-a" } }).allowed).toBe(false);
  });
});

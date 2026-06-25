import { TeacherRoleKind } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mergeTeacherPortalModules } from "../src/permissions/teacher-portal-modules";

describe("teacher-portal-modules", () => {
  it("HTPO-only menu excludes syllabus and subjects", () => {
    const modules = mergeTeacherPortalModules([TeacherRoleKind.HTPO]);
    expect(modules).not.toContain("syllabus");
    expect(modules).not.toContain("subjects");
  });

  it("STPO menu is dashboard, timetable, subjects, syllabus, and update-syllabus only", () => {
    expect(mergeTeacherPortalModules([TeacherRoleKind.STPO])).toEqual([
      "dashboard",
      "timetable",
      "subjects",
      "syllabus",
      "syllabus_progress"
    ]);
  });

  it("CTPO menu includes subjects and syllabus", () => {
    const modules = mergeTeacherPortalModules([TeacherRoleKind.CTPO]);
    expect(modules).toContain("subjects");
    expect(modules).toContain("syllabus");
  });

  it("merges HTPO modules when STPO is combined with HTPO", () => {
    const modules = mergeTeacherPortalModules([TeacherRoleKind.HTPO, TeacherRoleKind.STPO]);
    expect(modules).toContain("dashboard");
    expect(modules).toContain("announcements");
    expect(modules).toContain("feedback");
  });
});

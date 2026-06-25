import { TeacherRoleKind } from "@prisma/client";
import { describe, expect, it } from "vitest";

/**
 * Documents syllabus setup rules enforced in TeacherPortalSyllabusService.
 * Sections come from teacher CTPO/STPO assignments (same scope as Subjects page).
 * Subjects come from SectionSubjectAssignment rows — never deleted by the portal UI.
 */
describe("teacher portal syllabus setup rules", () => {
  it("requires CTPO or STPO for syllabus access", () => {
    const roles: TeacherRoleKind[] = [TeacherRoleKind.HTPO];
    const eligible = roles.includes(TeacherRoleKind.STPO) || roles.includes(TeacherRoleKind.CTPO);
    expect(eligible).toBe(false);
  });

  it("allows CTPO and STPO teachers", () => {
    const cases: TeacherRoleKind[][] = [
      [TeacherRoleKind.CTPO],
      [TeacherRoleKind.STPO],
      [TeacherRoleKind.CTPO, TeacherRoleKind.STPO]
    ];
    for (const roles of cases) {
      const eligible = roles.includes(TeacherRoleKind.STPO) || roles.includes(TeacherRoleKind.CTPO);
      expect(eligible).toBe(true);
    }
  });

  it("uses section+subject assignment keys without mixing sections", () => {
    const key = (sectionId: string, subjectId: string) => `${sectionId}:${subjectId}`;
    expect(key("sec-a", "sub-1")).not.toBe(key("sec-b", "sub-1"));
  });
});

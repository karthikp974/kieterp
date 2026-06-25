import { describe, expect, it } from "vitest";
import { AnnouncementTeacherRoleFilter, AnnouncementTeacherScope, TeacherRoleKind, UserType } from "@prisma/client";
import { AnnouncementsService } from "../src/announcements/announcements.service";
import { AuthUser } from "../src/auth/auth.types";

function teacherUser(assignments: AuthUser["assignments"]): AuthUser {
  return {
    id: "t1",
    type: UserType.TEACHER,
    fullName: "Teacher",
    email: "t@example.com",
    assignments
  } as AuthUser;
}

describe("AnnouncementsService teacher delivery", () => {
  const service = new AnnouncementsService({} as never, {} as never);

  const item = {
    audience: "TEACHERS",
    teacherScope: AnnouncementTeacherScope.BRANCH,
    teacherBranchId: "branch-1",
    teacherProgramId: "prog-1",
    teacherCampusId: "campus-1",
    teacherRoleFilter: AnnouncementTeacherRoleFilter.CTPO,
    campusId: null,
    programId: null,
    branchId: null,
    batchId: null,
    classId: null,
    sectionId: null
  };

  it("matches teachers in branch with required role", () => {
    const user = teacherUser([{ role: TeacherRoleKind.CTPO, branchId: "branch-1", campusId: "campus-1", programId: "prog-1" } as never]);
    expect((service as any).teacherSeesAnnouncement(user, item)).toBe(true);
  });

  it("rejects teachers without required role", () => {
    const user = teacherUser([{ role: TeacherRoleKind.STPO, branchId: "branch-1", campusId: "campus-1", programId: "prog-1" } as never]);
    expect((service as any).teacherSeesAnnouncement(user, item)).toBe(false);
  });

  it("allows any role when filter is ALL", () => {
    const user = teacherUser([{ role: TeacherRoleKind.HTPO, branchId: "branch-2" } as never]);
    expect((service as any).teacherSeesAnnouncement(user, { ...item, teacherRoleFilter: AnnouncementTeacherRoleFilter.ALL })).toBe(false);
    expect(
      (service as any).teacherSeesAnnouncement(user, {
        ...item,
        teacherRoleFilter: AnnouncementTeacherRoleFilter.ALL,
        teacherScope: AnnouncementTeacherScope.INSTITUTION,
        teacherBranchId: null,
        teacherProgramId: null,
        teacherCampusId: null
      })
    ).toBe(true);
  });
});

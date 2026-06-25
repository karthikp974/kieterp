-- Teacher role filter for announcement targeting (HTPO / CTPO / STPO / ALL)

CREATE TYPE "AnnouncementTeacherRoleFilter" AS ENUM ('ALL', 'HTPO', 'CTPO', 'STPO');

ALTER TABLE "Announcement" ADD COLUMN "teacherRoleFilter" "AnnouncementTeacherRoleFilter" NOT NULL DEFAULT 'ALL';

CREATE INDEX "Announcement_teacherRoleFilter_idx" ON "Announcement"("teacherRoleFilter");

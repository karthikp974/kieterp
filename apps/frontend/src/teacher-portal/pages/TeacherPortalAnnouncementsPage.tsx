import { TeacherAnnouncementsPanel } from "../../announcements/AnnouncementsPanels";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

export function TeacherPortalAnnouncementsPage() {
  return (
    <RequireTeacherModule moduleKey="announcements">
      <TeacherPortalModuleShell subtitle={TEACHER_MODULE_SUBTITLES.announcements}>
        <TeacherPortalPanelWrap>
          <TeacherAnnouncementsPanel />
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

import { Outlet } from "react-router-dom";
import { AnnouncementPortalProvider } from "../announcements/announcement-portal-context";
import { RequireTeacherModule } from "./RequireTeacherModule";
import { TeacherEngageScopeProvider } from "./TeacherEngageScopeProvider";

/** Full admin announcement workflow — hub, create, history — without an extra portal hero header. */
export function TeacherAnnouncementsLayout() {
  return (
    <RequireTeacherModule moduleKey="announcements">
      <TeacherEngageScopeProvider>
        <AnnouncementPortalProvider basePath="/teacher/announcements" variant="teacher">
          <Outlet />
        </AnnouncementPortalProvider>
      </TeacherEngageScopeProvider>
    </RequireTeacherModule>
  );
}

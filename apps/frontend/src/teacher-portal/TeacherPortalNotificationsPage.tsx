import { PortalNotificationsPage } from "../shared/notifications/PortalNotificationsPage";
import { TEACHER_NOTIFICATIONS_REFRESH } from "./useTeacherNotificationCount";

export function TeacherPortalNotificationsPage() {
  return (
    <PortalNotificationsPage
      apiBase="/api/portals/teacher/notifications"
      announcementsHref="/teacher/announcements"
      refreshEvent={TEACHER_NOTIFICATIONS_REFRESH}
    />
  );
}

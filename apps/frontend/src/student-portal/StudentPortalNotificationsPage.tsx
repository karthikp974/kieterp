import { PortalNotificationsPage } from "../shared/notifications/PortalNotificationsPage";
import { STUDENT_NOTIFICATIONS_REFRESH } from "./student-portal-notification-events";

export function StudentPortalNotificationsPage() {
  return (
    <PortalNotificationsPage
      apiBase="/api/portals/student/notifications"
      announcementsHref="/student/engage/announcements"
      refreshEvent={STUDENT_NOTIFICATIONS_REFRESH}
    />
  );
}

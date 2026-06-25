/** Client event to refresh header notification badge after read/mark actions. */
export const STUDENT_NOTIFICATIONS_REFRESH = "student-portal:notifications-refresh";

export function dispatchStudentNotificationsRefresh() {
  window.dispatchEvent(new CustomEvent(STUDENT_NOTIFICATIONS_REFRESH));
}

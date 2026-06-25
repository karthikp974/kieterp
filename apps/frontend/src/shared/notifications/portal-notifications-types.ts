export type PortalNotificationFeedItem = {
  id: string;
  kind: "ANNOUNCEMENT" | "FEEDBACK" | "SYSTEM";
  title: string;
  bodyPreview: string;
  createdAt: string;
  readAt: string | null;
  href: string;
  priority?: string | null;
  pinned?: boolean;
  announcementId?: string;
  feedbackFormId?: string;
  portalNotificationId?: string;
};

export type PortalNotificationsListResponse = {
  items: PortalNotificationFeedItem[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
};

export type PortalNotificationsPageConfig = {
  apiBase: string;
  announcementsHref?: string;
  refreshEvent: string;
};

export const NOTIFICATION_KIND_OPTIONS = [
  { value: "", label: "All types" },
  { value: "ANNOUNCEMENT", label: "Announcements" },
  { value: "FEEDBACK", label: "Feedback" },
  { value: "SYSTEM", label: "System" }
] as const;

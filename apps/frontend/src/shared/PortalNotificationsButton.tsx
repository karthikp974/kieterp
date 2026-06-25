import { Bell } from "lucide-react";

type Props = {
  unreadCount: number;
  onClick: () => void;
  className?: string;
};

export function PortalNotificationsButton({ unreadCount, onClick, className = "portal-notifications-btn" }: Props) {
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <button type="button" className={className} aria-label={label} onClick={onClick}>
      <Bell size={20} strokeWidth={2} aria-hidden />
      {unreadCount > 0 ? (
        <span className="portal-notifications-dot" aria-hidden>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

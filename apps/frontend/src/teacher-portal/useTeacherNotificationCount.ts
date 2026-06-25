import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";

export const TEACHER_NOTIFICATIONS_REFRESH = "erp:teacher-notifications-refresh";

/** Poll teacher notification unread count; refetch on focus and after mark-read. */
export function useTeacherNotificationCount(pollMs = 60_000) {
  const { authFetch, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (user?.type !== "TEACHER") return;
    try {
      const res = await authFetch("/api/portals/teacher/notifications/unread-count");
      if (!res.ok) return;
      const data = (await res.json()) as { unreadCount?: number };
      setUnreadCount(Math.max(0, data.unreadCount ?? 0));
    } catch {
      /* ignore */
    }
  }, [authFetch, user?.type]);

  useEffect(() => {
    if (user?.type !== "TEACHER") return;
    let alive = true;

    async function loadSafe() {
      await load();
    }

    void loadSafe();
    const timer = window.setInterval(() => {
      if (alive) void loadSafe();
    }, pollMs);

    const onFocus = () => void loadSafe();
    const onRefresh = () => void loadSafe();
    window.addEventListener("focus", onFocus);
    window.addEventListener(TEACHER_NOTIFICATIONS_REFRESH, onRefresh);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(TEACHER_NOTIFICATIONS_REFRESH, onRefresh);
    };
  }, [load, pollMs, user?.type]);

  return unreadCount;
}

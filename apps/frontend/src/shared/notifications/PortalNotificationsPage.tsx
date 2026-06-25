import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../toast-context";
import {
  type PortalNotificationFeedItem,
  type PortalNotificationsListResponse,
  type PortalNotificationsPageConfig
} from "./portal-notifications-types";
import { PortalNotificationsSkeleton } from "./PortalNotificationsSkeleton";

import { formatIstLocaleDateTime } from "../ist-time";

function formatWhen(iso: string) {
  try {
    return formatIstLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

function kindLabel(kind: PortalNotificationFeedItem["kind"]) {
  if (kind === "ANNOUNCEMENT") return "Announcement";
  if (kind === "FEEDBACK") return "Feedback";
  return "Notice";
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function dispatchRefresh(eventName: string) {
  window.dispatchEvent(new CustomEvent(eventName));
}

type Props = PortalNotificationsPageConfig;

export function PortalNotificationsPage({ apiBase, announcementsHref, refreshEvent }: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<PortalNotificationFeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize)
      });
      if (unreadOnly) params.set("unreadOnly", "true");

      const res = await authFetch(`${apiBase}?${params.toString()}`);
      if (!res.ok) throw await readError(res);
      const data = (await res.json()) as PortalNotificationsListResponse;
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setTotal(data.total);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load notifications.", "error");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authFetch, page, pageSize, showToast, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markItemRead(item: PortalNotificationFeedItem) {
    if (item.readAt) return;
    try {
      await authFetch(`${apiBase}/${encodeURIComponent(item.id)}/read`, { method: "POST" });
      dispatchRefresh(refreshEvent);
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* non-blocking */
    }
  }

  async function openItem(item: PortalNotificationFeedItem) {
    await markItemRead(item);
    if (item.announcementId && announcementsHref) {
      navigate(`${announcementsHref}?open=${encodeURIComponent(item.announcementId)}`);
      return;
    }
    navigate(item.href);
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await authFetch(`${apiBase}/mark-all-read`, { method: "POST" });
      if (!res.ok) throw await readError(res);
      showToast("All notifications marked as read.", "success");
      dispatchRefresh(refreshEvent);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not mark all as read.", "error");
    } finally {
      setMarkingAll(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showInitialSkeleton = loading && items.length === 0;

  if (showInitialSkeleton) {
    return <PortalNotificationsSkeleton />;
  }

  return (
    <div className="sp-notif">
      <header className="sp-notif-head">
        <p className="sp-notif-page-sub">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</p>

        <div className="sp-notif-toolbar">
          <label className="sp-notif-filter">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
            />
            Unread only
          </label>
          {unreadCount > 0 ? (
            <button type="button" className="db-wf-btn db-wf-btn--secondary sp-notif-mark-all" disabled={markingAll} onClick={() => void markAllRead()}>
              {markingAll ? "Marking…" : "Mark all as read"}
            </button>
          ) : null}
        </div>
      </header>

      {loading && items.length > 0 ? <p className="sp-notif-loading-hint db-muted">Refreshing…</p> : null}

      {items.length === 0 ? (
        <p className="sp-notif-empty">No notifications to show.</p>
      ) : (
        <ul className="sp-notif-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`sp-notif-item${!item.readAt ? " sp-notif-item--unread" : ""}`}
                onClick={() => void openItem(item)}
              >
                <div className="sp-notif-item-top">
                  <span className="sp-notif-kind">{kindLabel(item.kind)}</span>
                  {!item.readAt ? <span className="sp-notif-unread-dot" aria-hidden /> : null}
                </div>
                <strong className="sp-notif-item-title">{item.title}</strong>
                <p className="sp-notif-item-body">{item.bodyPreview}</p>
                <span className="sp-notif-item-meta">{formatWhen(item.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > pageSize ? (
        <nav className="sp-notif-pagination" aria-label="Notifications pagination">
          <button type="button" className="db-wf-btn db-wf-btn--secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="sp-notif-page-info">
            Page {page} of {totalPages} · {total} total
          </span>
          <button
            type="button"
            className="db-wf-btn db-wf-btn--secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

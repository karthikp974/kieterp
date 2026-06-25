import { Download, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { dispatchStudentNotificationsRefresh } from "../student-portal-notification-events";
import type { StudentAnnouncementListItem } from "./student-announcements-types";
import { StudentAnnouncementDetailSkeleton } from "./StudentAnnouncementDetailSkeleton";
import { formatIstLocaleDateTime } from "../../shared/ist-time";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return formatIstLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

type Props = {
  open: boolean;
  loading: boolean;
  announcement: (StudentAnnouncementListItem & { body: string }) | null;
  onClose: () => void;
  onMarkedRead: () => void;
};

export function StudentAnnouncementDetailModal({ open, loading, announcement, onClose, onMarkedRead }: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const markedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      markedRef.current = false;
      return;
    }
    if (!announcement?.id || announcement.readAt || markedRef.current) return;
    markedRef.current = true;
    void (async () => {
      try {
        const res = await authFetch(`/api/portals/student/engage/announcements/${encodeURIComponent(announcement.id)}/read`, {
          method: "POST"
        });
        if (res.ok) {
          onMarkedRead();
          dispatchStudentNotificationsRefresh();
        }
      } catch {
        /* non-blocking */
      }
    })();
  }, [announcement?.id, announcement?.readAt, authFetch, onMarkedRead, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="sp-ann-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sp-ann-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-ann-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-ann-modal-head">
          <h2 id="sp-ann-modal-title" className="sp-ann-modal-title">
            {loading ? "Loading…" : (announcement?.title ?? "Announcement")}
          </h2>
          <button type="button" className="sp-ann-modal-close" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {loading || !announcement ? (
          <StudentAnnouncementDetailSkeleton />
        ) : (
          <div className="sp-ann-modal-body">
            <p className="sp-ann-modal-meta">
              By <strong>{announcement.createdBy}</strong> · {formatWhen(announcement.publishedAt ?? announcement.createdAt)}
            </p>
            <div className="sp-ann-modal-badges">
              {announcement.pinned ? <span className="sp-ann-badge sp-ann-badge--pin">Pinned</span> : null}
              <span className="sp-ann-badge sp-ann-badge--status">{announcement.priority}</span>
              <span className="sp-ann-badge sp-ann-badge--status">{announcement.status}</span>
            </div>
            <div className="sp-ann-modal-message">{announcement.body}</div>
            {announcement.attachments.length > 0 ? (
              <section className="sp-ann-modal-attachments" aria-label="Attachments">
                <h3 className="sp-ann-modal-attachments-title">Attachments</h3>
                <ul className="sp-ann-modal-attachments-list">
                  {announcement.attachments.map((att) => (
                    <li key={att.id}>
                      <a
                        className="sp-ann-attachment-link"
                        href={`/api/announcements/${encodeURIComponent(announcement.id)}/attachments/${encodeURIComponent(att.id)}/file`}
                        onClick={(e) => {
                          e.preventDefault();
                          void downloadAttachment(authFetch, announcement.id, att.id, att.originalName, showToast);
                        }}
                      >
                        <Download size={14} aria-hidden />
                        {att.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

async function downloadAttachment(
  authFetch: (url: string, init?: RequestInit) => Promise<Response>,
  announcementId: string,
  attachmentId: string,
  name: string,
  showToast: (msg: string, kind: "success" | "error") => void
) {
  try {
    const res = await authFetch(
      `/api/announcements/${encodeURIComponent(announcementId)}/attachments/${encodeURIComponent(attachmentId)}/file`
    );
    if (!res.ok) {
      showToast("Could not download attachment.", "error");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Download started.", "success");
  } catch {
    showToast("Could not download attachment.", "error");
  }
}

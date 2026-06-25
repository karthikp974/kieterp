import { formatIstLocaleDateTime } from "../../shared/ist-time";
import type { StudentAnnouncementListItem } from "./student-announcements-types";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return formatIstLocaleDateTime(iso);
  } catch {
    return iso;
  }
}

function priorityClass(priority: string) {
  if (priority === "URGENT") return "sp-ann-badge sp-ann-badge--urgent";
  if (priority === "IMPORTANT") return "sp-ann-badge sp-ann-badge--important";
  return "sp-ann-badge sp-ann-badge--normal";
}

type Props = {
  item: StudentAnnouncementListItem;
  onOpen: (id: string) => void;
};

export function StudentAnnouncementCard({ item, onOpen }: Props) {
  const unread = !item.readAt;
  const when = formatWhen(item.publishedAt ?? item.createdAt);

  return (
    <article
      className={`sp-ann-card${unread ? " sp-ann-card--unread" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item.id);
        }
      }}
    >
      <div className="sp-ann-card-top">
        <h2 className="sp-ann-card-title">{item.title}</h2>
        <div className="sp-ann-card-badges">
          {item.pinned ? <span className="sp-ann-badge sp-ann-badge--pin">Pinned</span> : null}
          <span className={priorityClass(item.priority)}>{item.priority}</span>
          <span className="sp-ann-badge sp-ann-badge--status">{item.status}</span>
        </div>
      </div>
      <p className="sp-ann-card-body">{item.body}</p>
      <div className="sp-ann-card-meta">
        <span>{item.createdBy}</span>
        <span>{when}</span>
        {unread ? <span className="sp-ann-unread-dot" aria-label="Unread" /> : null}
      </div>
    </article>
  );
}

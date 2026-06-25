import { Link } from "react-router-dom";
import { formatFeedbackDateTime, formatFeedbackFormType } from "./format-feedback-date";
import type { StudentFeedbackListItem } from "./student-feedback-types";

function statusClass(status: StudentFeedbackListItem["lifecycleStatus"]) {
  if (status === "PENDING") return "sp-fb-badge sp-fb-badge--pending";
  if (status === "SUBMITTED") return "sp-fb-badge sp-fb-badge--submitted";
  if (status === "UPCOMING") return "sp-fb-badge sp-fb-badge--upcoming";
  return "sp-fb-badge sp-fb-badge--expired";
}

function statusLabel(status: StudentFeedbackListItem["lifecycleStatus"]) {
  if (status === "UPCOMING") return "Opens soon";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

type Props = {
  item: StudentFeedbackListItem;
};

export function StudentFeedbackCard({ item }: Props) {
  const typeLabel = formatFeedbackFormType(item.formType, item.customType);
  const openHref = `/student/feedback/${item.id}`;
  const showSubmit = item.canSubmit && item.lifecycleStatus === "PENDING";
  const showView = item.lifecycleStatus === "SUBMITTED" || item.lifecycleStatus === "EXPIRED";

  return (
    <article className={`sp-fb-card sp-fb-card--${item.lifecycleStatus.toLowerCase()}`}>
      <div className="sp-fb-card-top">
        <h2 className="sp-fb-card-title">{item.title}</h2>
        <span className={statusClass(item.lifecycleStatus)}>{statusLabel(item.lifecycleStatus)}</span>
      </div>
      <p className="sp-fb-card-type">{typeLabel}</p>
      <p className="sp-fb-card-desc">{item.descriptionPreview}</p>
      <dl className="sp-fb-card-meta">
        <div>
          <dt>Opens</dt>
          <dd>{formatFeedbackDateTime(item.startsAt)}</dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>{formatFeedbackDateTime(item.endsAt)}</dd>
        </div>
        <div>
          <dt>Assigned by</dt>
          <dd>{item.assignedBy}</dd>
        </div>
      </dl>
      <div className="sp-fb-card-actions">
        {showSubmit ? (
          <Link to={openHref} className="sp-fb-btn sp-fb-btn--primary">
            Submit feedback
          </Link>
        ) : null}
        {showView ? (
          <Link to={openHref} className="sp-fb-btn sp-fb-btn--secondary">
            View response
          </Link>
        ) : null}
        {item.lifecycleStatus === "UPCOMING" ? (
          <span className="sp-fb-card-hint">Submission opens on the start date above.</span>
        ) : null}
      </div>
    </article>
  );
}

import { formatIstLocaleDateTime } from "../../shared/ist-time";
import { formatApplicationCategory, formatApplicationStatus, type StudentApplicationItem } from "./student-applications-types";

type Props = {
  item: StudentApplicationItem;
};

export function StudentApplicationRequestCard({ item }: Props) {
  return (
    <article className="sp-app-request-card">
      <div className="sp-app-request-head">
        <div className="sp-app-request-badges">
          <span className="sp-app-request-category">{formatApplicationCategory(item.category)}</span>
          <span className={`sp-app-request-status sp-app-request-status--${item.status.toLowerCase()}`}>
            {formatApplicationStatus(item.status)}
          </span>
        </div>
        <h3 className="sp-app-request-title">{item.subject}</h3>
      </div>
      <p className="sp-app-request-message">{item.message}</p>
      <dl className="sp-app-request-meta">
        <div>
          <dt>Submitted</dt>
          <dd>{formatIstLocaleDateTime(item.createdAt)}</dd>
        </div>
        <div>
          <dt>Response</dt>
          <dd>{item.response?.trim() ? item.response : "—"}</dd>
        </div>
        {item.reviewedBy ? (
          <div>
            <dt>Reviewed by</dt>
            <dd>
              {item.reviewedBy}
              {item.reviewedAt ? ` · ${formatIstLocaleDateTime(item.reviewedAt)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

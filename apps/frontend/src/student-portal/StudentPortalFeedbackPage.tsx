import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentFeedbackCard } from "./feedback/StudentFeedbackCard";
import { StudentPortalFeedbackSkeleton } from "./feedback/StudentPortalFeedbackSkeleton";
import type { StudentFeedbackListResponse } from "./feedback/student-feedback-types";
import { dispatchStudentNotificationsRefresh } from "./student-portal-notification-events";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalFeedbackPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<StudentFeedbackListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/feedback/forms?pageSize=50");
      if (!res.ok) throw await readError(res);
      setData((await res.json()) as StudentFeedbackListResponse);
      dispatchStudentNotificationsRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load feedback forms.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const formIdFromNotif = searchParams.get("form");

  useEffect(() => {
    if (formIdFromNotif && data && !loading) {
      const el = document.getElementById(`sp-fb-card-${formIdFromNotif}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [formIdFromNotif, data, loading]);

  if (loading && !data) {
    return <StudentPortalFeedbackSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Feedback forms could not be loaded.</p>;
  }

  const sections = [
    { key: "pending", title: "Pending feedback", items: data.grouped.pending },
    { key: "submitted", title: "Submitted", items: data.grouped.submitted },
    { key: "expired", title: "Expired", items: data.grouped.expired }
  ] as const;

  const hasAny = data.items.length > 0;

  return (
    <div className="sp-fb">
      <header className="sp-fb-head">
        <p className="sp-fb-page-sub">Forms assigned to your campus, department, branch, batch, class, and section.</p>
      </header>

      {!hasAny ? (
        <p className="sp-fb-empty">No feedback forms are assigned to you right now.</p>
      ) : (
        sections.map((section) =>
          section.items.length ? (
            <section key={section.key} className="sp-fb-section" aria-labelledby={`sp-fb-sec-${section.key}`}>
              <h2 id={`sp-fb-sec-${section.key}`} className="sp-fb-section-title">
                {section.title}
                <span className="sp-fb-section-count">{section.items.length}</span>
              </h2>
              <div className="sp-fb-grid">
                {section.items.map((item) => (
                  <div key={item.id} id={`sp-fb-card-${item.id}`}>
                    <StudentFeedbackCard item={item} />
                  </div>
                ))}
              </div>
            </section>
          ) : null
        )
      )}
    </div>
  );
}

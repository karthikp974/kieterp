import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { networkErrorMessage } from "../shared/api-base";
import { PaginatedResponse } from "../structure/structure-types";
import { StudentApplicationRequestCard } from "./applications/StudentApplicationRequestCard";
import { StudentPortalApplicationsSkeleton } from "./applications/StudentPortalApplicationsSkeleton";
import { StudentApplicationCategoryField } from "./applications/StudentApplicationCategoryField";
import type { ApplicationCategory, StudentApplicationItem } from "./applications/student-applications-types";
import { scrollStudentPortalFieldIntoView } from "./scroll-student-portal-field";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalApplicationsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<StudentApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: "GENERAL" as ApplicationCategory, subject: "", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authFetch("/api/applications/me?pageSize=25");
      if (!res.ok) throw await readError(res);
      const page = (await res.json()) as PaginatedResponse<StudentApplicationItem>;
      setItems(page.items);
    } catch (error) {
      setLoadError(networkErrorMessage(error, "Could not reach the server."));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await authFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Submit failed.");
      }
      setForm({ category: "GENERAL", subject: "", message: "" });
      await load();
      showToast("Application submitted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Submit failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && items.length === 0 && !loadError) {
    return <StudentPortalApplicationsSkeleton />;
  }

  return (
    <div className="sp-app">
      <header className="sp-app-head">
        <p className="sp-app-page-sub">
          Submit leave, certificate, attendance, fees, or other requests to your section teacher. Track status and replies
          here.
        </p>
      </header>

      <section className="sp-app-card" aria-labelledby="sp-app-new-title">
        <h2 id="sp-app-new-title" className="sp-app-card-title">
          New application
        </h2>
        <form className="sp-app-form" onSubmit={(event) => void submitApplication(event)}>
          <div className="sp-app-field">
            <span id="sp-app-category-label">Category</span>
            <StudentApplicationCategoryField
              value={form.category}
              disabled={submitting}
              aria-labelledby="sp-app-category-label"
              onChange={(category) => setForm({ ...form, category })}
            />
          </div>
          <div className="sp-app-field">
            <span id="sp-app-subject-label">Subject</span>
            <input
              id="sp-app-subject"
              className="sp-app-input"
              placeholder="Short title for your request"
              value={form.subject}
              aria-labelledby="sp-app-subject-label"
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              onFocus={(event) => {
                window.setTimeout(() => scrollStudentPortalFieldIntoView(event.currentTarget), 320);
              }}
              required
            />
          </div>
          <div className="sp-app-field sp-app-field--full">
            <span id="sp-app-details-label">Details</span>
            <textarea
              id="sp-app-details"
              className="sp-app-textarea"
              placeholder="Explain what you need and any relevant dates or documents"
              value={form.message}
              aria-labelledby="sp-app-details-label"
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              onFocus={(event) => {
                window.setTimeout(() => scrollStudentPortalFieldIntoView(event.currentTarget), 320);
              }}
              required
            />
          </div>
          <button type="submit" className="sp-app-submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </form>
      </section>

      <section className="sp-app-list-section" aria-labelledby="sp-app-list-title">
        <h2 id="sp-app-list-title" className="sp-app-section-title">
          My requests
        </h2>
        {loading ? (
          <p className="sp-app-empty">Loading your applications…</p>
        ) : loadError ? (
          <p className="sp-app-empty sp-app-empty--error">{loadError}</p>
        ) : items.length === 0 ? (
          <p className="sp-app-empty">You have not submitted any applications yet.</p>
        ) : (
          <div className="sp-app-list">
            {items.map((item) => (
              <StudentApplicationRequestCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

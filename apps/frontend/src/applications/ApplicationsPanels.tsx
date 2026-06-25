import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { pickTeacherAssignment, teacherScopeQueryParams } from "../teacher-portal/teacher-scope-params";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { WfBtn } from "../shared/WfBtn";
import { useToast } from "../shared/toast-context";
import { networkErrorMessage } from "../shared/api-base";
import { formatIstLocaleDateTime } from "../shared/ist-time";
import { PaginatedResponse } from "../structure/structure-types";

type ApplicationCategory = "GENERAL" | "ATTENDANCE" | "FEES" | "RESULTS" | "CERTIFICATE" | "LEAVE" | "OTHER";
type ApplicationStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";
type StudentApplication = {
  id: string;
  category: ApplicationCategory;
  subject: string;
  message: string;
  status: ApplicationStatus;
  response?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  student: { id: string; rollNumber: string; fullName: string; section: string; semester: number };
};

const categories: ApplicationCategory[] = ["GENERAL", "ATTENDANCE", "FEES", "RESULTS", "CERTIFICATE", "LEAVE", "OTHER"];
const reviewStatuses: ApplicationStatus[] = ["IN_REVIEW", "APPROVED", "REJECTED", "CLOSED"];
const PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  GENERAL: "General",
  ATTENDANCE: "Attendance",
  FEES: "Fees",
  RESULTS: "Results",
  CERTIFICATE: "Certificate",
  LEAVE: "Leave",
  OTHER: "Other"
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CLOSED: "Closed"
};

function useApi() {
  const { authFetch } = useAuth();

  const fetchJson = useCallback(async <T,>(path: string) => {
    const response = await authFetch(path);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      throw new Error(message || `Request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }, [authFetch]);

  const sendJson = useCallback(async <T,>(path: string, body: unknown, method = "POST") => {
    const response = await authFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Application action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }, [authFetch]);

  return { fetchJson, sendJson };
}

function loadErrorMessage(error: unknown) {
  return networkErrorMessage(error, "Could not reach the server.");
}

function ApplicationsShell({ children, variant }: { children: ReactNode; variant: "teacher" | "student" | "admin" }) {
  if (variant === "teacher") {
    return <div className="portal-engage-workflow ann-workflow app-workflow">{children}</div>;
  }
  return <div className={`app-workflow app-workflow--${variant}`}>{children}</div>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className ? `db-field ${className}` : "db-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatCategory(category: ApplicationCategory) {
  return CATEGORY_LABELS[category] ?? category;
}

function formatStatus(status: ApplicationStatus) {
  return STATUS_LABELS[status] ?? status;
}

export function AdminApplicationsPanel() {
  return (
    <ApplicationsShell variant="admin">
      <ReviewerApplicationsPanel variant="admin" />
    </ApplicationsShell>
  );
}

export function TeacherApplicationsPanel() {
  return (
    <ApplicationsShell variant="teacher">
      <ReviewerApplicationsPanel variant="teacher" teacherScoped />
    </ApplicationsShell>
  );
}

function ReviewerApplicationsPanel({
  variant,
  teacherScoped = false
}: {
  variant: "teacher" | "admin";
  teacherScoped?: boolean;
}) {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [items, setItems] = useState<StudentApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [review, setReview] = useState({ id: "", status: "IN_REVIEW" as ApplicationStatus, response: "" });
  const [saving, setSaving] = useState(false);
  const [scopeReady, setScopeReady] = useState(!teacherScoped);
  const scopeParamsRef = useRef<URLSearchParams>(new URLSearchParams());
  const reviewRef = useRef<HTMLDivElement>(null);
  const loadSeqRef = useRef(0);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const statusOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All statuses"]];
    for (const item of ["PENDING", ...reviewStatuses] as ApplicationStatus[]) {
      rows.push([item, formatStatus(item)]);
    }
    return rows;
  }, []);

  const load = useCallback(
    async (notifyError = false) => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (teacherScoped) {
          for (const [key, value] of scopeParamsRef.current.entries()) params.set(key, value);
        }
        if (status) params.set("status", status);
        if (appliedSearch.trim()) params.set("search", appliedSearch.trim());
        const pageData = await fetchJson<PaginatedResponse<StudentApplication>>(`/api/applications?${params.toString()}`);
        if (seq !== loadSeqRef.current) return;
        setItems(pageData.items);
        setTotal(pageData.total);
      } catch (error) {
        if (seq !== loadSeqRef.current) return;
        const message = loadErrorMessage(error);
        setLoadError(message);
        setItems([]);
        setTotal(0);
        if (notifyError) showToastRef.current(message, "error");
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [appliedSearch, fetchJson, page, status, teacherScoped]
  );

  useEffect(() => {
    if (!teacherScoped) {
      setScopeReady(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const dashboard = await fetchJson<{ assignments: Parameters<typeof pickTeacherAssignment>[0] }>("/api/portals/teacher/dashboard");
        if (!alive) return;
        scopeParamsRef.current = teacherScopeQueryParams(pickTeacherAssignment(dashboard.assignments));
      } catch (error) {
        if (!alive) return;
        setLoadError(loadErrorMessage(error));
        setLoading(false);
      } finally {
        if (alive) setScopeReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchJson, teacherScoped]);

  useEffect(() => {
    if (!scopeReady) return;
    void load();
  }, [load, scopeReady]);

  function applyFilters() {
    setPage(1);
    setAppliedSearch(search);
  }

  function selectForReview(item: StudentApplication) {
    setReview({
      id: item.id,
      status: item.status === "PENDING" ? "IN_REVIEW" : item.status,
      response: item.response ?? ""
    });
    reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function reviewApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review.id) {
      showToast("Select an application to update", "error");
      return;
    }
    setSaving(true);
    try {
      await sendJson(`/api/applications/${review.id}/review`, { status: review.status, response: review.response || undefined }, "PATCH");
      setReview({ id: "", status: "IN_REVIEW", response: "" });
      await load();
      showToast("Application updated");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const reviewOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "Select application"]];
    for (const item of items) {
      rows.push([item.id, `${item.student.rollNumber} — ${item.subject}`]);
    }
    return rows;
  }, [items]);

  const reviewStatusOptions = useMemo(
    (): readonly FormSelectOption[] => reviewStatuses.map((item) => [item, formatStatus(item)]),
    []
  );

  return (
    <section className="db-workflow-body ann-workflow-body app-workflow-body">
      <p className="app-workflow-lead">
        {variant === "teacher"
          ? "Students submit formal requests (leave, certificates, attendance corrections, etc.) for your section. Review them here and reply with approve, reject, or close."
          : "Review student requests across your permitted campus scopes."}
      </p>

      <div className="db-card app-filter-card mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <FormSelect value={status} options={statusOptions} onChange={setStatus} />
        </Field>
        <Field label="Search" className="app-filter-search">
          <input
            className="db-input"
            placeholder="Roll, name, subject, or message"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
          />
        </Field>
        <WfBtn type="button" onClick={applyFilters}>
          Apply filters
        </WfBtn>
        <WfBtn type="button" onClick={() => void load(true)}>
          Refresh
        </WfBtn>
      </div>

      {loading ? (
        <p className="app-empty">Loading applications…</p>
      ) : loadError ? (
        <p className="app-empty app-empty--error">{loadError}</p>
      ) : items.length === 0 ? (
        <p className="app-empty">No applications in your scope yet. Students submit requests from the student portal under Engage → Applications.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <ApplicationCard
              key={item.id}
              item={item}
              selected={review.id === item.id}
              onReview={() => selectForReview(item)}
              showReviewAction
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="ann-pagination mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Page {page} · {total} total
          </p>
          <div className="flex gap-2">
            <WfBtn type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </WfBtn>
            <WfBtn type="button" onClick={() => setPage((p) => (p * PAGE_SIZE < total ? p + 1 : p))} disabled={page * PAGE_SIZE >= total}>
              Next
            </WfBtn>
          </div>
        </div>
      ) : null}

      <div ref={reviewRef} className="db-card ann-content-card app-review-card mt-6">
        <h3 className="app-review-title">Update application</h3>
        <p className="app-review-lead">Select a request above or from the dropdown, set status, and add an optional note for the student.</p>
        <form className="app-review-form" onSubmit={(event) => void reviewApplication(event)}>
          <Field label="Application">
            <FormSelect
              value={review.id}
              options={reviewOptions}
              onChange={(id) => {
                const item = items.find((row) => row.id === id);
                if (!item) {
                  setReview({ id: "", status: "IN_REVIEW", response: "" });
                  return;
                }
                selectForReview(item);
              }}
            />
          </Field>
          <Field label="Status">
            <FormSelect
              value={review.status}
              options={reviewStatusOptions}
              onChange={(next) => setReview({ ...review, status: next as ApplicationStatus })}
            />
          </Field>
          <Field label="Response / note">
            <textarea
              className="db-input min-h-[88px]"
              placeholder="Reply shown to the student"
              value={review.response}
              onChange={(event) => setReview({ ...review, response: event.target.value })}
            />
          </Field>
          <div className="db-wf-actions">
            <WfBtn type="button" onClick={() => setReview({ id: "", status: "IN_REVIEW", response: "" })}>
              Clear
            </WfBtn>
            <WfBtn type="submit" variant="primary" disabled={!review.id || saving}>
              {saving ? "Saving…" : "Update application"}
            </WfBtn>
          </div>
        </form>
      </div>
    </section>
  );
}

export function StudentApplicationsPanel() {
  return (
    <ApplicationsShell variant="student">
      <StudentApplicationsContent />
    </ApplicationsShell>
  );
}

function StudentApplicationsContent() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [items, setItems] = useState<StudentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: "GENERAL" as ApplicationCategory, subject: "", message: "" });
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const categoryOptions = useMemo(
    (): readonly FormSelectOption[] => categories.map((item) => [item, formatCategory(item)]),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await fetchJson<PaginatedResponse<StudentApplication>>("/api/applications/me?pageSize=25");
      setItems(page.items);
    } catch (error) {
      setLoadError(loadErrorMessage(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await sendJson("/api/applications", form);
      setForm({ category: "GENERAL", subject: "", message: "" });
      await load();
      showToast("Application submitted");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Submit failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="db-workflow-body ann-workflow-body app-workflow-body">
      <p className="app-workflow-lead">
        Submit leave, certificate, attendance, fees, or other requests to your section teacher. Track status and replies here.
      </p>

      <div className="db-card ann-content-card app-submit-card mb-6">
        <h3 className="app-review-title">New application</h3>
        <form className="app-review-form" onSubmit={(event) => void submitApplication(event)}>
          <Field label="Category">
            <FormSelect
              value={form.category}
              options={categoryOptions}
              onChange={(category) => setForm({ ...form, category: category as ApplicationCategory })}
            />
          </Field>
          <Field label="Subject">
            <input
              className="db-input"
              placeholder="Short title for your request"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              required
            />
          </Field>
          <Field label="Details">
            <textarea
              className="db-input min-h-[120px]"
              placeholder="Explain what you need and any relevant dates or documents"
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              required
            />
          </Field>
          <div className="db-wf-actions">
            <WfBtn type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit application"}
            </WfBtn>
          </div>
        </form>
      </div>

      <h3 className="app-section-title">My requests</h3>
      {loading ? (
        <p className="app-empty">Loading your applications…</p>
      ) : loadError ? (
        <p className="app-empty app-empty--error">{loadError}</p>
      ) : items.length === 0 ? (
        <p className="app-empty">You have not submitted any applications yet.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <ApplicationCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function ApplicationCard({
  item,
  selected = false,
  onReview,
  showReviewAction = false
}: {
  item: StudentApplication;
  selected?: boolean;
  onReview?: () => void;
  showReviewAction?: boolean;
}) {
  return (
    <article className={`db-card ann-list-card app-list-card${selected ? " is-selected" : ""}`}>
      <div className="app-list-card-head">
        <div className="min-w-0 flex-1">
          <div className="app-list-card-meta">
            <span className="app-category-chip">{formatCategory(item.category)}</span>
            <span className={`app-status-badge app-status-badge--${item.status.toLowerCase()}`}>{formatStatus(item.status)}</span>
          </div>
          <h4 className="app-list-card-title">{item.subject}</h4>
          {showReviewAction ? (
            <p className="app-list-card-student">
              {item.student.rollNumber} · {item.student.fullName} · Section {item.student.section}
            </p>
          ) : null}
        </div>
        {showReviewAction && onReview ? (
          <WfBtn type="button" onClick={onReview}>
            Review
          </WfBtn>
        ) : null}
      </div>
      <p className="app-list-card-message">{item.message}</p>
      <dl className="app-list-card-details">
        {!showReviewAction ? (
          <div>
            <dt>Submitted</dt>
            <dd>{formatIstLocaleDateTime(item.createdAt)}</dd>
          </div>
        ) : null}
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
        {showReviewAction ? (
          <div>
            <dt>Submitted</dt>
            <dd>{formatIstLocaleDateTime(item.createdAt)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

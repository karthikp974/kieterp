import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { formatIstLocaleDate } from "../shared/ist-time";
import { PaginatedResponse } from "../structure/structure-types";

type Audience = "ALL" | "STUDENTS" | "TEACHERS" | "BOTH";
type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  status: AnnouncementStatus;
  scope: { campusId?: string; programId?: string; branchId?: string; batchId?: string; classId?: string; sectionId?: string };
  createdBy: string;
  publishedAt?: string | null;
  expiresAt?: string | null;
  readAt?: string | null;
};

const inputClass = "db-input";

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Announcement action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return { fetchJson, sendJson };
}

export function AdminAnnouncementsPanel() {
  const navigate = useNavigate();
  return (
    <section className="erp-admin-panel rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950 dark:text-slate-50">Announcements</h2>
          <p className="text-sm text-slate-500">Create targeted announcements and track read status in the dedicated workspace.</p>
        </div>
        <button
          type="button"
          className="erp-panel-submit"
          onClick={() => navigate("/announcements")}
        >
          Open announcements
        </button>
      </div>
    </section>
  );
}

export function TeacherAnnouncementsPanel() {
  return <AnnouncementWorkspace title="Scoped Announcements" description="Publish and view notices inside your assigned scope." canCreate />;
}

export function StudentAnnouncementsPanel() {
  return <AnnouncementWorkspace title="Announcements" description="College notices visible for your class and campus." />;
}

function AnnouncementWorkspace({ title, description, canCreate = false }: { title: string; description: string; canCreate?: boolean }) {
  const { fetchJson, sendJson } = useApi();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [search, setSearch] = useState("");
  const [scopeIndex, setScopeIndex] = useState("global");
  const [form, setForm] = useState({ title: "", body: "", audience: "ALL" as Audience, expiresAt: "" });
  const teacherScopes = user?.assignments.filter((assignment) => assignment.role === "CTPO" || assignment.role === "HTPO") ?? [];

  async function load() {
    const params = new URLSearchParams({ pageSize: "25" });
    if (search) params.set("search", search);
    if (!canCreate) params.set("includeReadStatus", "true");
    const page = await fetchJson<PaginatedResponse<Announcement>>(`/api/announcements?${params.toString()}`);
    setItems(page.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load announcements", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedScope = scopeIndex === "global" ? undefined : teacherScopes[Number(scopeIndex)];
    await sendJson("/api/announcements", {
      ...form,
      expiresAt: form.expiresAt || undefined,
      campusId: selectedScope?.campusId ?? undefined,
      programId: selectedScope?.programId ?? undefined,
      branchId: selectedScope?.branchId ?? undefined,
      batchId: selectedScope?.batchId ?? undefined,
      classId: selectedScope?.classId ?? undefined,
      sectionId: selectedScope?.sectionId ?? undefined
    });
    setForm({ title: "", body: "", audience: "ALL", expiresAt: "" });
    await load();
    showToast("Announcement published");
  }

  async function markRead(id: string) {
    await sendJson(`/api/announcements/${id}/read`, {});
    await load();
    window.dispatchEvent(new Event("erp:teacher-notifications-refresh"));
    showToast("Marked as read");
  }

  return (
    <section className="erp-admin-panel rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Announcements refreshed"))}>Refresh</SafeActionButton>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <input className={inputClass} placeholder="Search announcements" value={search} onChange={(event) => setSearch(event.target.value)} />
        <SafeActionButton run={load}>Apply Search</SafeActionButton>
      </div>
      {canCreate ? (
        <form className="erp-admin-form mb-4 grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void createAnnouncement(event)}>
          <input className={inputClass} placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <SearchableSelect
            value={form.audience}
            options={
              user?.type === "TEACHER"
                ? [
                    ["ALL", "All"],
                    ["STUDENTS", "Students"],
                    ["TEACHERS", "Teachers"]
                  ]
                : [
                    ["ALL", "All"],
                    ["STUDENTS", "Students"],
                    ["TEACHERS", "Teachers"],
                    ["BOTH", "Students & teachers"]
                  ]
            }
            onChange={(audience) => setForm({ ...form, audience: audience as Audience })}
            searchable={false}
          />
          {user?.type === "TEACHER" ? (
            <SearchableSelect value={scopeIndex === "global" ? "" : scopeIndex} placeholder="Select assigned scope" options={teacherScopes.map((assignment, index) => [String(index), `${assignment.role} - ${assignment.sectionId ?? assignment.classId ?? assignment.branchId ?? "scope"}`])} onChange={setScopeIndex} required searchable={false} />
          ) : (
            <SearchableSelect value={scopeIndex} options={[["global", "Global announcement"]]} onChange={setScopeIndex} searchable={false} />
          )}
          <input className={inputClass} type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
          <textarea className={`${inputClass} md:col-span-3`} placeholder="Announcement body" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />
          <button className="erp-panel-submit">Publish</button>
        </form>
      ) : null}
      <div className="grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-950">{item.title}</h3>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{item.audience}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
            <p className="mt-3 text-xs text-slate-500">
              By {item.createdBy}
              {item.expiresAt ? ` - Expires ${formatIstLocaleDate(item.expiresAt)}` : ""}
              {!canCreate ? (item.readAt ? " · Read" : " · Unread") : null}
            </p>
            {!canCreate && !item.readAt ? (
              <div className="mt-2">
                <SafeActionButton run={() => markRead(item.id)}>Mark as read</SafeActionButton>
              </div>
            ) : null}
          </article>
        ))}
        {items.length === 0 ? <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">No announcements found.</p> : null}
      </div>
    </section>
  );
}

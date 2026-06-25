import { ArrowLeft, History, Plus, type LucideIcon } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { FilePickerTrigger } from "../shared/FilePickerSheet";
import { FormActionRow } from "../shared/FormActionRow";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { WfBtn } from "../shared/WfBtn";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { toFormSelectOptions } from "../shared/select-options";
import { formatIstLocaleDate, formatIstLocaleDateTime } from "../shared/ist-time";
import { TeacherEngageSectionFilter } from "../teacher-portal/TeacherEngageSectionFilter";
import { useOptionalTeacherEngage } from "../teacher-portal/TeacherEngageScopeProvider";
import { appendSectionQuery } from "../teacher-portal/teacher-engage-types";
import { canTeacherManageAnnouncements } from "../teacher-portal/teacher-engage-permissions";
import {
  useAnnouncementNavigate,
  useAnnouncementPaths,
  useAnnouncementPortal
} from "./announcement-portal-context";
import { programsForOperationalCampus, type CampusPicker, type ProgramPicker } from "../shared/academic-catalog";
import {
  AnnouncementTargetingForm,
  deepestStudentPayload,
  teacherTargetingPayload,
  validateAnnouncementTargeting,
  type Audience,
  type StudentScope,
  type TeacherRoleFilter,
  type TeacherScope
} from "./AnnouncementTargetingForm";

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

type Campus = { id: string; code: string; name: string };
type Program = { id: string; code: string; name: string; campusId: string };
type Branch = { id: string; code: string; name: string; programId: string };
type Batch = { id: string; batchCode: string; startYear: number; endYear: number };
type AcademicClass = { id: string; label: string; semesterNumber: number };
type Section = { id: string; name: string; code: string };

type Priority = "NORMAL" | "IMPORTANT" | "URGENT";

type AnnouncementListItem = {
  id: string;
  title: string;
  body: string;
  audience: string;
  status: string;
  priority: string;
  pinned?: boolean;
  scope: {
    campusId?: string | null;
    programId?: string | null;
    branchId?: string | null;
    batchId?: string | null;
    classId?: string | null;
    sectionId?: string | null;
  };
  teacherScope: string;
  teacherRoleFilter: string;
  teacherCampusId?: string | null;
  teacherProgramId?: string | null;
  teacherBranchId?: string | null;
  createdBy: string;
  publishedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
  readAt?: string | null;
};

type AnnouncementDetail = AnnouncementListItem & { body: string };

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function GlassButton({ children, onClick, tone = "default" }: { children: ReactNode; onClick: () => void; tone?: "default" | "danger" }) {
  return (
    <WfBtn className="ann-inline-action" variant={tone === "danger" ? "danger" : "secondary"} onClick={onClick}>
      {children}
    </WfBtn>
  );
}

function HubActionButton({ children, description, icon, onClick, tone = "default" }: { children: ReactNode; description: string; icon: LucideIcon; onClick: () => void; tone?: "default" | "danger" }) {
  return (
    <OptionActionButton description={description} icon={icon} tone={tone} onClick={onClick}>
      {children}
    </OptionActionButton>
  );
}
function AnnouncementShell({ children, title, variant = "subpage" }: { children: ReactNode; title: string; variant?: "main" | "subpage" }) {
  const navigate = useNavigate();
  const { variant: portalVariant } = useAnnouncementPortal();
  const body = <section className="db-workflow-body ann-workflow-body">{children}</section>;

  if (portalVariant === "teacher") {
    return <div className="portal-engage-workflow ann-workflow">{body}</div>;
  }

  return (
    <main className="db-workflow ann-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? (
            <AdminWorkflowMenuButton />
          ) : (
            <button className="db-icon-button" type="button" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton className="erp-top-avatar" />
        </div>
      </header>
      {body}
    </main>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatAudience(a: string) {
  if (a === "STUDENTS") return "Students";
  if (a === "TEACHERS") return "Teachers";
  if (a === "BOTH") return "Students & teachers";
  if (a === "ALL") return "Everyone";
  return a;
}

function formatPriority(p: string) {
  if (p === "IMPORTANT") return "Important";
  if (p === "URGENT") return "Urgent";
  return "Normal";
}

function scopeSummary(row: AnnouncementListItem) {
  const s = row.scope;
  const parts: string[] = [];
  if (s.sectionId) parts.push("Section");
  else if (s.classId) parts.push("Class");
  else if (s.batchId) parts.push("Batch");
  else if (s.branchId) parts.push("Branch");
  else if (s.programId) parts.push("Department");
  else if (s.campusId) parts.push("Campus");
  else parts.push("Institution");
  if (row.audience === "TEACHERS" || row.audience === "BOTH") {
    const role = row.teacherRoleFilter === "ALL" ? "all roles" : row.teacherRoleFilter;
    const ts = row.teacherScope;
    if (ts === "INSTITUTION") parts.push(`Teachers: institution (${role})`);
    else if (ts === "CAMPUS") parts.push(`Teachers: campus (${role})`);
    else if (ts === "DEPARTMENT") parts.push(`Teachers: department (${role})`);
    else if (ts === "BRANCH") parts.push(`Teachers: branch (${role})`);
  }
  return parts.join(" \u00b7 ");
}

function useAnnouncementsApi() {
  const { authFetch } = useAuth();

  const fetchJson = useCallback(
    async <T,>(path: string) => {
      const response = await authFetch(path);
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  const sendJson = useCallback(
    async <T,>(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
      const response = await authFetch(path, {
        method,
        headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body)
      });
      if (!response.ok) throw await responseError(response);
      return (await response.json().catch(() => ({}))) as T;
    },
    [authFetch]
  );

  const uploadFile = useCallback(
    async (announcementId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      const response = await authFetch(`/api/announcements/${announcementId}/attachments`, { method: "POST", body: form });
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as { attachment: { id: string; originalName: string } };
    },
    [authFetch]
  );

  return { fetchJson, sendJson, uploadFile };
}

function useStructureLists() {
  const { fetchJson } = useAnnouncementsApi();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [campusesLoading, setCampusesLoading] = useState(false);

  const loadCampuses = useCallback(async () => {
    setCampusesLoading(true);
    try {
      const page = await fetchJson<Page<Campus>>("/api/campuses?pageSize=100");
      setCampuses(page.items);
      return page.items;
    } finally {
      setCampusesLoading(false);
    }
  }, [fetchJson]);

  const loadPrograms = useCallback(
    async (campusId: string) => {
      const page = await fetchJson<Page<Program>>(`/api/core/programs?pageSize=100&campusId=${encodeURIComponent(campusId)}`);
      setPrograms(programsForOperationalCampus(page.items as ProgramPicker[], campusId, campuses as CampusPicker[]));
    },
    [fetchJson, campuses]
  );

  const loadBranches = useCallback(
    async (programId: string, campusId: string) => {
      const qs = new URLSearchParams({ pageSize: "100", programId, campusId });
      const page = await fetchJson<Page<Branch>>(`/api/core/branches?${qs.toString()}`);
      setBranches(page.items);
    },
    [fetchJson]
  );

  const loadBatches = useCallback(
    async (branchId: string, programId: string, campusId: string) => {
      const qs = new URLSearchParams({ pageSize: "100", branchId, programId, campusId });
      const page = await fetchJson<Page<Batch>>(`/api/core/batches?${qs.toString()}`);
      setBatches(page.items);
    },
    [fetchJson]
  );

  const loadClasses = useCallback(
    async (batchId: string) => {
      const page = await fetchJson<Page<AcademicClass>>(`/api/core/classes?pageSize=100&batchId=${encodeURIComponent(batchId)}`);
      setClasses(page.items);
    },
    [fetchJson]
  );

  const loadSections = useCallback(
    async (classId: string) => {
      const page = await fetchJson<Page<Section>>(`/api/core/sections?pageSize=100&classId=${encodeURIComponent(classId)}`);
      setSections(page.items);
    },
    [fetchJson]
  );

  return {
    campuses,
    programs,
    branches,
    batches,
    classes,
    sections,
    setPrograms,
    setBranches,
    setBatches,
    setClasses,
    setSections,
    campusesLoading,
    loadCampuses,
    loadPrograms,
    loadBranches,
    loadBatches,
    loadClasses,
    loadSections
  };
}

export function AnnouncementsHubPage() {
  const navigate = useAnnouncementNavigate();
  const paths = useAnnouncementPaths();
  const { variant } = useAnnouncementPortal();
  const { user } = useAuth();
  const engage = useOptionalTeacherEngage();
  const canManage = variant !== "teacher" || canTeacherManageAnnouncements(user, engage?.setup ?? null);

  return (
    <AnnouncementShell title="Announcements" variant="main">
      {canManage ? (
        <WorkflowSection title="Publish">
          <HubActionButton
            description="Publish a student announcement for your assigned section."
            icon={Plus}
            onClick={() => navigate(paths.create)}
          >
            Create announcement
          </HubActionButton>
        </WorkflowSection>
      ) : null}
      <WorkflowSection title="Activity">
        <HubActionButton
          description="View announcements published for your section."
          icon={History}
          onClick={() => navigate(paths.history)}
        >
          Announcement history
        </HubActionButton>
      </WorkflowSection>
    </AnnouncementShell>
  );
}

export function AnnouncementCreatePage() {
  const navigate = useAnnouncementNavigate();
  const paths = useAnnouncementPaths();
  const { variant } = useAnnouncementPortal();
  const { user } = useAuth();
  const engage = useOptionalTeacherEngage();
  const canManage = variant !== "teacher" || canTeacherManageAnnouncements(user, engage?.setup ?? null);
  const { showToast } = useToast();
  const { sendJson, uploadFile } = useAnnouncementsApi();
  const studentStructure = useStructureLists();
  const teacherStructure = useStructureLists();
  const [isSaving, setIsSaving] = useState(false);
  const [audience, setAudience] = useState<Audience>("STUDENTS");
  const [studentScope, setStudentScope] = useState<StudentScope>({ campusId: "", programId: "", branchId: "", batchId: "", classId: "", sectionId: "" });
  const [teacherScope, setTeacherScope] = useState<TeacherScope>({ campusId: "", programId: "", branchId: "" });
  const [teacherRoleFilter, setTeacherRoleFilter] = useState<TeacherRoleFilter>("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const teacherSectionOptions = useMemo((): readonly FormSelectOption[] => {
    return toFormSelectOptions((engage?.setup?.sections ?? []).map((s) => [s.id, s.label] as const)) as readonly FormSelectOption[];
  }, [engage?.setup?.sections]);

  useEffect(() => {
    if (variant !== "teacher") return;
    const defaultSection = engage?.activeSectionId ?? engage?.setup?.sections[0]?.id ?? "";
    if (defaultSection && !studentScope.sectionId) {
      setStudentScope((scope) => ({ ...scope, sectionId: defaultSection }));
    }
  }, [variant, engage?.activeSectionId, engage?.setup?.sections, studentScope.sectionId]);

  useEffect(() => {
    if (variant === "teacher") return;
    void (async () => {
      try {
        const [studentCampuses, teacherCampuses] = await Promise.all([
          studentStructure.loadCampuses(),
          teacherStructure.loadCampuses()
        ]);
        if (!studentCampuses.length) {
          showToast("No campuses returned — check database seed or Department & Branch setup.", "error");
        }
        if (import.meta.env.DEV && studentCampuses.length !== teacherCampuses.length) {
          console.warn("Announcement create: student/teacher campus lists differ");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load campuses", "error");
      }
    })();
    // Load once on mount — do not re-bind to unstable hook object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (variant === "teacher" && !canManage) {
    return <Navigate to={paths.hub} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (variant === "teacher") {
      if (!studentScope.sectionId) {
        showToast("Select a section.", "error");
        return;
      }
    } else {
      const scopeErr = validateAnnouncementTargeting(audience, studentScope, teacherScope);
      if (scopeErr) {
        showToast(scopeErr, "error");
        return;
      }
    }
    setIsSaving(true);
    try {
      const studentPayload =
        variant === "teacher" ? { sectionId: studentScope.sectionId } : audience === "TEACHERS" ? {} : deepestStudentPayload(studentScope);
      const teacherPayload = audience === "STUDENTS" ? {} : teacherTargetingPayload(teacherScope, teacherRoleFilter);
      const payload = {
        title: title.trim(),
        body: body.trim(),
        audience,
        status: "PUBLISHED",
        priority,
        pinned,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.000Z` : undefined,
        ...studentPayload,
        ...teacherPayload
      };
      const created = await sendJson<{ announcement: { id: string } }>("/api/announcements", payload);
      if (file) {
        try {
          await uploadFile(created.announcement.id, file);
          showToast("Attachment uploaded");
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Attachment failed", "error");
        }
      }
      showToast("Announcement created");
      navigate(paths.history);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AnnouncementShell title="Create announcement">
      <form className="ann-form-shell mx-auto flex max-w-3xl flex-col gap-6" onSubmit={(e) => void submit(e)}>
        {variant === "teacher" ? (
          <div className="db-card db-form ann-content-card grid gap-4">
            <Field label="Section">
              <FormSelect
                value={studentScope.sectionId}
                options={teacherSectionOptions}
                onChange={(id) => setStudentScope((scope) => ({ ...scope, sectionId: id }))}
                required
              />
            </Field>
            <p className="text-sm portal-text-muted">Student-targeted announcements only — limited to your assigned section.</p>
          </div>
        ) : (
          <AnnouncementTargetingForm
            audience={audience}
            setAudience={setAudience}
            studentScope={studentScope}
            setStudentScope={setStudentScope}
            teacherScope={teacherScope}
            setTeacherScope={setTeacherScope}
            teacherRoleFilter={teacherRoleFilter}
            setTeacherRoleFilter={setTeacherRoleFilter}
            studentStructure={studentStructure}
            teacherStructure={teacherStructure}
          />
        )}
        <div className="db-card db-form ann-content-card grid gap-4">
          <Field label="Title">
            <input className="db-input" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} />
          </Field>
          <Field label="Description">
            <textarea className="db-input min-h-[140px]" value={body} onChange={(e) => setBody(e.target.value)} required minLength={10} maxLength={8000} />
          </Field>
          <Field label="Priority">
            <SearchableSelect
              value={priority}
              options={[
                ["NORMAL", "Normal"],
                ["IMPORTANT", "Important"],
                ["URGENT", "Urgent"]
              ]}
              onChange={(v) => setPriority(v as Priority)}
              searchable={false}
              clearable={false}
              placeholder="Select priority"
            />
          </Field>
          <Field label="Pin on lists">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pinned
            </label>
          </Field>
          <Field label="Expiry (optional)">
            <input className="db-input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
          <Field label="Attachment (PDF, DOCX, JPG, PNG — max 10MB)">
            <FilePickerTrigger
              label="Choose attachment"
              hint="Tap to pick from library, camera, or files"
              fileName={file?.name}
              mode="documents"
              showGoogleDrive
              onFile={(picked) => setFile(picked)}
            />
          </Field>
          <FormActionRow
            primaryLabel={isSaving ? "Publishing…" : "Publish announcement"}
            primaryDisabled={isSaving}
            onCancel={() => {
              showToast("Create announcement cancelled", "info");
              navigate(paths.hub);
            }}
          />
        </div>
      </form>
    </AnnouncementShell>
  );
}
export function AnnouncementHistoryPage() {
  const navigate = useAnnouncementNavigate();
  const paths = useAnnouncementPaths();
  const { variant } = useAnnouncementPortal();
  const { user } = useAuth();
  const { fetchJson } = useAnnouncementsApi();
  const { showToast } = useToast();
  const engage = useOptionalTeacherEngage();
  const canManage = variant !== "teacher" || canTeacherManageAnnouncements(user, engage?.setup ?? null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async (notify = false) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeReadStatus: "true" });
      if (status) params.set("status", status);
      const path = appendSectionQuery(`/api/announcements?${params.toString()}`, engage?.activeSectionId ?? "");
      const res = await fetchJson<Page<AnnouncementListItem>>(path);
      setItems(res.items);
      setTotal(res.total);
      if (notify) {
        showToast(res.total ? `${res.total} announcement(s) loaded` : "No announcements found", "info");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [engage?.activeSectionId, fetchJson, page, showToast, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AnnouncementShell title="Announcement history">
      <TeacherEngageSectionFilter className="mb-4" />
      <div className="db-card db-form ann-filter-card mb-4 flex flex-wrap items-end gap-3">
        {canManage ? (
          <GlassButton onClick={() => navigate(paths.create)}>Create announcement</GlassButton>
        ) : null}
        <Field label="Status">
          <SearchableSelect
            value={status}
            options={[
              ["", "All"],
              ["PUBLISHED", "Published"],
              ["DRAFT", "Draft"],
              ["ARCHIVED", "Archived"]
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
              showToast("Status filter updated", "info");
            }}
            searchable={false}
            placeholder="All statuses"
          />
        </Field>
        <GlassButton onClick={() => void load(true)}>Refresh</GlassButton>
      </div>
      <div className="grid gap-3">
        {items.map((row) => (
          <article
            key={row.id}
            className="db-card ann-list-card motion-safe:transition motion-safe:duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-slate-900/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{row.title}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {formatAudience(row.audience)} ? {scopeSummary(row)} ? {formatPriority(row.priority)}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.status}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{row.body}</p>
            <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-600 dark:text-slate-400">Created by</dt>
                <dd>{row.createdBy}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600 dark:text-slate-400">Created</dt>
                <dd>{formatIstLocaleDateTime(row.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600 dark:text-slate-400">Expires</dt>
                <dd>{row.expiresAt ? formatIstLocaleDate(row.expiresAt) : "?"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600 dark:text-slate-400">Read</dt>
                <dd>{row.readAt ? "Read" : "Unread"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="ann-pagination mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {page} · {total} total
        </p>
        <div className="flex gap-2">
          <GlassButton onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</GlassButton>
          <GlassButton onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}>Next</GlassButton>
        </div>
      </div>
    </AnnouncementShell>
  );
}


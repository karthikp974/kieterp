import { Archive, ArrowLeft, BarChart3, Bell, ChevronDown, ChevronUp, ClipboardList, Download, Pencil, Plus, Trash2, Users, X, type LucideIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { resolveFeedbackHref, useFeedbackNavigate, useFeedbackPaths, useFeedbackPortal } from "./feedback-portal-context";
import { ErpLoader } from "../shared/ErpLoader";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { RequiredToggle } from "../shared/RequiredToggle";
import { useToast } from "../shared/toast-context";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { formatIstLocaleDate, formatIstLocaleDateTime } from "../shared/ist-time";
import { useConfirm } from "../shared/ConfirmDialog";
import { WfBtn } from "../shared/WfBtn";
import { TeacherEngageSectionFilter } from "../teacher-portal/TeacherEngageSectionFilter";
import { useOptionalTeacherEngage } from "../teacher-portal/TeacherEngageScopeProvider";
import { appendSectionQuery } from "../teacher-portal/teacher-engage-types";
import { canTeacherManageFeedback } from "../teacher-portal/teacher-engage-permissions";
import { programsForOperationalCampus, type CampusPicker, type ProgramPicker } from "../shared/academic-catalog";
import {
  validateFeedbackStep1,
  validateFeedbackStep2,
  validateFeedbackStep3,
  validateFeedbackStep4,
  type FeedbackQuestionDraft
} from "./feedback-create-validation";
import { buildQuestionsPayload, questionsFromApi, toDateInputValue } from "./feedback-form-utils";
import {
  downloadFeedbackExport,
  FEEDBACK_EXPORT_FORMATS,
  type FeedbackExportVariant
} from "./feedback-export-utils";

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

type Program = { id: string; code: string; name: string; campusId: string };
type Branch = { id: string; code: string; name: string; programId?: string };
type Batch = { id: string; batchCode: string; branchId?: string };
type AcademicClass = { id: string; label: string; semesterNumber: number; batchId?: string };
type Section = { id: string; name: string; classId?: string };

const FORM_TYPES: readonly FormSelectOption[] = [
  ["GUEST_LECTURE", "Guest Lecture Feedback"],
  ["SEMESTER_EXAM", "Semester Exam Feedback"],
  ["WORKSHOP", "Workshop Feedback"],
  ["SEMINAR", "Seminar Feedback"],
  ["ACADEMIC_EVENT", "Academic Event Feedback"],
  ["OTHER", "Other"]
];

const Q_TYPES: readonly FormSelectOption[] = [
  ["RATING_SCALE", "Rating scale (1–5)"],
  ["YES_NO", "Yes / No"],
  ["MULTIPLE_CHOICE", "Multiple choice"],
  ["PARAGRAPH", "Paragraph answer"]
];

type StudentScope = { campusId: string; programId: string; branchId: string; batchId: string; classId: string; sectionId: string };

function deepestScope(s: StudentScope): Record<string, string> {
  if (s.sectionId) return { sectionId: s.sectionId };
  if (s.classId) return { classId: s.classId };
  if (s.batchId) return { batchId: s.batchId };
  if (s.branchId) return { branchId: s.branchId };
  if (s.programId) return { programId: s.programId };
  if (s.campusId) return { campusId: s.campusId };
  return {};
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function FeedbackShell({
  children,
  title,
  variant = "subpage",
  backHref
}: {
  children: ReactNode;
  title: string;
  variant?: "main" | "subpage";
  /** When set, back control navigates here instead of browser history. */
  backHref?: string;
}) {
  const navigate = useNavigate();
  const { basePath, variant: portalVariant } = useFeedbackPortal();
  const resolvedBackHref = backHref ? resolveFeedbackHref(backHref, basePath) : undefined;
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
          ) : resolvedBackHref ? (
            <Link to={resolvedBackHref} className="db-icon-button" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" className="db-icon-button" onClick={() => navigate(-1)} aria-label="Back">
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

function useFeedbackApi() {
  const { authFetch } = useAuth();
  const fetchJson = useCallback(
    async <T,>(path: string) => {
      const r = await authFetch(path);
      if (!r.ok) throw await responseError(r);
      return (await r.json()) as T;
    },
    [authFetch]
  );
  const sendJson = useCallback(
    async <T,>(path: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
      const r = await authFetch(path, {
        method,
        headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body)
      });
      if (!r.ok) throw await responseError(r);
      return (await r.json().catch(() => ({}))) as T;
    },
    [authFetch]
  );
  return { fetchJson, sendJson, authFetch };
}

function HubActionButton({
  children,
  description,
  icon,
  onClick,
  tone = "default"
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <OptionActionButton description={description} icon={icon} tone={tone} onClick={onClick}>
      {children}
    </OptionActionButton>
  );
}

function useStructureLists() {
  const { fetchJson } = useFeedbackApi();
  const { variant: portalVariant } = useFeedbackPortal();
  const [campuses, setCampuses] = useState<CampusPicker[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [allClasses, setAllClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  const loadAllPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      if (portalVariant === "teacher") {
        const structure = await fetchJson<{
          campuses: CampusPicker[];
          programs: Program[];
          branches: Branch[];
          batches: { id: string; branchId: string; startYear: number; endYear: number }[];
          classes: AcademicClass[];
          sections: Section[];
        }>("/api/portals/teacher/structure");
        const mappedBatches = structure.batches.map((b) => ({
          id: b.id,
          branchId: b.branchId,
          batchCode: `${b.startYear}–${b.endYear}`
        }));
        setCampuses(structure.campuses);
        setPrograms(structure.programs);
        setAllBranches(structure.branches);
        setBranches(structure.branches);
        setAllBatches(mappedBatches);
        setBatches(mappedBatches);
        setAllClasses(structure.classes);
        setClasses(structure.classes);
        setAllSections(structure.sections);
        setSections(structure.sections);
        return structure.programs;
      }
      const [campusPage, p] = await Promise.all([
        fetchJson<Page<{ id: string; code: string; group?: { isolationPolicy?: "SHARED" | "ISOLATED" } }>>("/api/campuses?pageSize=100"),
        fetchJson<Page<Program>>("/api/core/programs?pageSize=100")
      ]);
      setCampuses(campusPage.items);
      setPrograms(p.items);
      return p.items;
    } finally {
      setProgramsLoading(false);
    }
  }, [fetchJson, portalVariant]);
  const loadBranches = useCallback(
    async (programId: string, campusId: string) => {
      if (portalVariant === "teacher") {
        setBranches(allBranches.filter((item) => item.programId === programId));
        return;
      }
      const qs = new URLSearchParams({ pageSize: "100", programId, campusId });
      const p = await fetchJson<Page<Branch>>(`/api/core/branches?${qs}`);
      setBranches(p.items);
    },
    [allBranches, fetchJson, portalVariant]
  );
  const loadBatches = useCallback(
    async (branchId: string, programId: string, campusId: string) => {
      if (portalVariant === "teacher") {
        setBatches(allBatches.filter((item) => item.branchId === branchId));
        return;
      }
      const qs = new URLSearchParams({ pageSize: "100", branchId, programId, campusId });
      const p = await fetchJson<Page<Batch>>(`/api/core/batches?${qs}`);
      setBatches(p.items);
    },
    [allBatches, fetchJson, portalVariant]
  );
  const loadClasses = useCallback(
    async (batchId: string) => {
      if (portalVariant === "teacher") {
        setClasses(allClasses.filter((item) => item.batchId === batchId));
        return;
      }
      const p = await fetchJson<Page<AcademicClass>>(`/api/core/classes?pageSize=100&batchId=${encodeURIComponent(batchId)}`);
      setClasses(p.items);
    },
    [allClasses, fetchJson, portalVariant]
  );
  const loadSections = useCallback(
    async (classId: string) => {
      if (portalVariant === "teacher") {
        setSections(allSections.filter((item) => item.classId === classId));
        return;
      }
      const p = await fetchJson<Page<Section>>(`/api/core/sections?pageSize=100&classId=${encodeURIComponent(classId)}`);
      setSections(p.items);
    },
    [allSections, fetchJson, portalVariant]
  );

  return {
    campuses,
    programs,
    programsForCampus: (campusId: string) => programsForOperationalCampus(programs as ProgramPicker[], campusId, campuses),
    branches,
    batches,
    classes,
    sections,
    setPrograms,
    setBranches,
    setBatches,
    setClasses,
    setSections,
    programsLoading,
    loadAllPrograms,
    loadBranches,
    loadBatches,
    loadClasses,
    loadSections
  };
}

export function FeedbackHubPage() {
  const navigate = useFeedbackNavigate();
  const { variant } = useFeedbackPortal();
  const { user } = useAuth();
  const engage = useOptionalTeacherEngage();
  const canManage = variant !== "teacher" || canTeacherManageFeedback(user, engage?.setup ?? null);

  return (
    <FeedbackShell title="Feedback" variant="main">
      {canManage ? (
        <WorkflowSection title="Forms">
          <HubActionButton
            description="Build a new feedback form with audience targeting and custom questions."
            icon={Plus}
            onClick={() => navigate("/feedback/create-feedback-form")}
          >
            Create feedback form
          </HubActionButton>
          <HubActionButton
            description="View and manage forms that are currently open for responses."
            icon={ClipboardList}
            onClick={() => navigate("/feedback/active-forms")}
          >
            Active feedback forms
          </HubActionButton>
          <HubActionButton
            description="Update an existing form’s type, audience, dates, or questions."
            icon={Pencil}
            onClick={() => navigate("/feedback/modify-feedback-form")}
          >
            Modify feedback form
          </HubActionButton>
          <HubActionButton
            description="Permanently remove a form and all of its responses."
            icon={Trash2}
            tone="danger"
            onClick={() => navigate("/feedback/delete-feedback-form")}
          >
            Delete feedback form
          </HubActionButton>
        </WorkflowSection>
      ) : null}
      <WorkflowSection title={canManage ? "Reports & archive" : "Reports"}>
        <HubActionButton
          description="Aggregated responses, ratings, and insights by form."
          icon={BarChart3}
          onClick={() => navigate("/feedback/feedback-reports")}
        >
          Feedback reports
        </HubActionButton>
        {canManage ? (
          <HubActionButton
            description="Browse closed forms and historical submission data."
            icon={Archive}
            onClick={() => navigate("/feedback/archived-feedbacks")}
          >
            Archived feedbacks
          </HubActionButton>
        ) : null}
      </WorkflowSection>
    </FeedbackShell>
  );
}

type QDraft = FeedbackQuestionDraft;

export function FeedbackCreateFormPage() {
  return <FeedbackFormWizard mode="create" />;
}

export function FeedbackModifyFormPage() {
  const { formId } = useParams();
  const navigate = useFeedbackNavigate();
  const { fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const [items, setItems] = useState<{ id: string; title: string; status: string }[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchJson<{ items: typeof items }>("/api/feedback/forms?pageSize=10&orderBy=createdAt");
        setItems(res.items);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Load failed", "error");
      }
    })();
  }, [fetchJson, showToast]);

  const formOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "Select a feedback form (10 most recent)"]];
    for (const row of items) {
      rows.push([row.id, `${row.title} (${row.status.replace(/_/g, " ").toLowerCase()})`]);
    }
    return rows;
  }, [items]);

  if (formId) return <FeedbackFormWizard mode="edit" formId={formId} />;

  return (
    <FeedbackShell title="Modify feedback form" backHref="/feedback">
      <div className="db-card db-form ann-content-card max-w-xl">
        <label className="db-field">
          <span>Select form</span>
          <FormSelect
            value=""
            options={formOptions}
            onChange={(id) => {
              if (id) navigate(`/feedback/modify-feedback-form/${id}`);
            }}
          />
        </label>
      </div>
    </FeedbackShell>
  );
}

export function FeedbackDeleteFormPage() {
  const navigate = useFeedbackNavigate();
  const { fetchJson, sendJson } = useFeedbackApi();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<{ id: string; title: string; status: string; totalResponses: number }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchJson<{ items: typeof items }>("/api/feedback/forms?pageSize=10&orderBy=createdAt");
        setItems(res.items);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Load failed", "error");
      }
    })();
  }, [fetchJson, showToast]);

  const selected = items.find((row) => row.id === selectedId);

  const formOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "Select a feedback form (10 most recent)"]];
    for (const row of items) {
      rows.push([row.id, `${row.title} (${row.status.replace(/_/g, " ").toLowerCase()})`]);
    }
    return rows;
  }, [items]);

  async function remove() {
    if (!selectedId || !selected) return;
    const ok = await confirm({
      title: "Delete feedback form?",
      message: `Permanently delete all ${selected.totalResponses} response(s)? This cannot be undone.`,
      itemName: selected.title,
      confirmLabel: "Delete",
      icon: Trash2
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await sendJson(`/api/feedback/forms/${selectedId}`, {}, "DELETE");
      showToast("Feedback form deleted", "warning");
      navigate("/feedback");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <FeedbackShell title="Delete feedback form" backHref="/feedback">
      <div className="db-card db-form ann-content-card max-w-xl grid gap-4">
        <label className="db-field">
          <span>Select form</span>
          <FormSelect value={selectedId} options={formOptions} onChange={setSelectedId} />
        </label>
        {selected ? (
          <>
            <div className="db-detail-grid">
              <div className="db-info">
                <span>Title</span>
                <strong>{selected.title}</strong>
              </div>
              <div className="db-info">
                <span>Status</span>
                <strong>{selected.status.replace(/_/g, " ")}</strong>
              </div>
              <div className="db-info">
                <span>Responses</span>
                <strong>{selected.totalResponses}</strong>
              </div>
            </div>
            <div className="db-archive-summary">
              <div>
                <p>{selected.title}</p>
                <span>
                  {selected.totalResponses} response{selected.totalResponses === 1 ? "" : "s"} will be removed
                </span>
              </div>
              <button type="button" className="text-red-600" disabled={deleting} onClick={() => void remove()}>
                <Trash2 size={18} /> {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {dialog}
    </FeedbackShell>
  );
}

function FeedbackFormWizard({ mode, formId }: { mode: "create" | "edit"; formId?: string }) {
  const navigate = useFeedbackNavigate();
  const paths = useFeedbackPaths();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { sendJson, fetchJson } = useFeedbackApi();
  const { variant: portalVariant } = useFeedbackPortal();
  const engage = useOptionalTeacherEngage();
  const canManage = portalVariant !== "teacher" || canTeacherManageFeedback(user, engage?.setup ?? null);
  const st = useStructureLists();
  const [step, setStep] = useState(1);
  const [formType, setFormType] = useState("GUEST_LECTURE");
  const [customType, setCustomType] = useState("");
  const [scope, setScope] = useState<StudentScope>({ campusId: "", programId: "", branchId: "", batchId: "", classId: "", sectionId: "" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [questions, setQuestions] = useState<QDraft[]>([
    { localKey: "q1", order: 0, type: "RATING_SCALE", prompt: "", required: true, choicesText: "Option A\nOption B" }
  ]);
  const [saving, setSaving] = useState(false);
  const [loadingForm, setLoadingForm] = useState(mode === "edit");
  const [responseCount, setResponseCount] = useState(0);
  const structureLocked = mode === "edit" && responseCount > 0;
  const questionsLocked = mode === "edit" && responseCount > 0;

  useEffect(() => {
    if (portalVariant === "teacher") return;
    void (async () => {
      try {
        const items = await st.loadAllPrograms();
        if (!items?.length && mode === "create") {
          showToast("No departments loaded — run database seed or add programs in Department & Branch.", "error");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load departments", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (portalVariant !== "teacher" || !engage?.setup) return;
    const defaultSection =
      engage.setup.fixedSectionId ?? engage.activeSectionId ?? engage.setup.sections[0]?.id ?? "";
    if (defaultSection && !scope.sectionId) {
      setScope((prev) => ({ ...prev, sectionId: defaultSection }));
    }
  }, [portalVariant, engage?.setup, engage?.activeSectionId, scope.sectionId]);

  useEffect(() => {
    if (mode !== "edit" || !formId) return;
    void (async () => {
      setLoadingForm(true);
      try {
        const res = await fetchJson<{
          form: {
            formType: string;
            customType: string | null;
            title: string;
            description: string;
            startsAt: string;
            endsAt: string;
            anonymous: boolean;
            allowMultiple: boolean;
            totalResponses: number;
            scope: StudentScope;
            questions: Parameters<typeof questionsFromApi>[0];
          };
        }>(`/api/feedback/forms/${formId}`);
        const f = res.form;
        setFormType(f.formType);
        setCustomType(f.customType ?? "");
        setTitle(f.title);
        setDescription(f.description);
        setStartsAt(toDateInputValue(f.startsAt));
        setEndsAt(toDateInputValue(f.endsAt));
        setAnonymous(f.anonymous);
        setAllowMultiple(f.allowMultiple);
        setResponseCount(f.totalResponses);
        const loadedScope: StudentScope = {
          campusId: f.scope.campusId ?? "",
          programId: f.scope.programId ?? "",
          branchId: f.scope.branchId ?? "",
          batchId: f.scope.batchId ?? "",
          classId: f.scope.classId ?? "",
          sectionId: f.scope.sectionId ?? ""
        };
        setScope(loadedScope);
        setQuestions(questionsFromApi(f.questions));
        const programs = await st.loadAllPrograms();
        const campusId =
          loadedScope.campusId ||
          programs.find((p) => p.id === loadedScope.programId)?.campusId ||
          "";
        if (loadedScope.programId && campusId) {
          await st.loadBranches(loadedScope.programId, campusId);
        }
        if (loadedScope.branchId && loadedScope.programId && campusId) {
          await st.loadBatches(loadedScope.branchId, loadedScope.programId, campusId);
        }
        if (loadedScope.batchId) await st.loadClasses(loadedScope.batchId);
        if (loadedScope.classId) await st.loadSections(loadedScope.classId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load form", "error");
        navigate("/feedback/modify-feedback-form");
      } finally {
        setLoadingForm(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, formId]);

  const teacherSectionOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "Select section"]];
    for (const section of engage?.setup?.sections ?? []) {
      rows.push([section.id, section.label]);
    }
    return rows;
  }, [engage?.setup?.sections]);

  function audiencePayload() {
    if (portalVariant === "teacher") {
      return scope.sectionId ? { sectionId: scope.sectionId } : {};
    }
    return deepestScope(scope);
  }

  function validateAudienceStep() {
    if (portalVariant === "teacher") {
      return scope.sectionId ? null : "Select a section.";
    }
    return validateFeedbackStep2(scope);
  }

  const programSelectOptions = useMemo((): readonly FormSelectOption[] => {
    if (st.programsLoading) return [["", "Loading departments…"]];
    if (!st.programs.length) return [["", "No departments — check seed / Department & Branch"]];
    const rows: FormSelectOption[] = [["", "All departments"]];
    for (const p of scope.campusId ? st.programsForCampus(scope.campusId) : st.programs) {
      rows.push([p.id, `${p.code} — ${p.name}`]);
    }
    return rows;
  }, [st.programs, st.programsLoading]);

  function campusIdForProgram(programId: string) {
    return scope.campusId || st.programs.find((p) => p.id === programId)?.campusId || "";
  }

  const branchSelectOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All branches in this department"]];
    for (const b of st.branches) rows.push([b.id, `${b.code} — ${b.name}`]);
    return rows;
  }, [st.branches]);

  const batchSelectOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All batches in this branch"]];
    for (const b of st.batches) rows.push([b.id, b.batchCode]);
    return rows;
  }, [st.batches]);

  const classSelectOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All classes in this batch"]];
    for (const c of st.classes) rows.push([c.id, `Sem ${c.semesterNumber} — ${c.label}`]);
    return rows;
  }, [st.classes]);

  const sectionSelectOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = [["", "All sections in this class"]];
    for (const s of st.sections) rows.push([s.id, s.name]);
    return rows;
  }, [st.sections]);

  function tryAdvance(next: number) {
    const err =
      step === 1
        ? validateFeedbackStep1(formType, customType)
        : step === 2 && !structureLocked
          ? validateAudienceStep()
          : step === 3
            ? validateFeedbackStep3(title, description, startsAt, endsAt)
            : null;
    if (err) {
      showToast(err, "error");
      return;
    }
    setStep(next);
  }

  async function publish() {
    setSaving(true);
    try {
      const stepErr =
        validateFeedbackStep1(formType, customType) ??
        (!structureLocked ? validateAudienceStep() : null) ??
        validateFeedbackStep3(title, description, startsAt, endsAt) ??
        (!questionsLocked ? validateFeedbackStep4(questions) : null);
      if (stepErr) {
        showToast(stepErr, "error");
        return;
      }
      const base = {
        formType,
        customType: formType === "OTHER" ? customType.trim() : undefined,
        title: title.trim(),
        description: description.trim(),
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: `${endsAt}T23:59:59.000Z`,
        anonymous,
        allowMultiple
      };
      if (mode === "create") {
        await sendJson("/api/feedback/forms", {
          ...base,
          ...audiencePayload(),
          status: "ACTIVE",
          questions: buildQuestionsPayload(questions)
        });
        showToast("Feedback form created");
      } else {
        const body: Record<string, unknown> = { ...base };
        if (!structureLocked) Object.assign(body, audiencePayload());
        if (!questionsLocked) body.questions = buildQuestionsPayload(questions);
        await sendJson(`/api/feedback/forms/${formId}`, body, "PATCH");
        showToast("Feedback form updated");
      }
      navigate("/feedback/active-forms");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadingForm) {
    return (
      <FeedbackShell
        title={mode === "create" ? "Create feedback form" : "Modify feedback form"}
        backHref={mode === "create" ? "/feedback" : "/feedback/modify-feedback-form"}
      >
        <ErpLoader label="Loading feedback form…" size={88} />
      </FeedbackShell>
    );
  }

  if (portalVariant === "teacher" && engage && !engage.loading && !canManage) {
    return <Navigate to={paths.hub} replace />;
  }

  const teacherSectionLocked =
    structureLocked ||
    Boolean(engage && !engage.loading && !(engage.setup?.sections?.length ?? 0));
  const teacherFixedSectionLabel =
    engage?.setup?.fixedSectionId != null
      ? engage.setup.sections.find((s) => s.id === engage.setup?.fixedSectionId)?.label ??
        engage.setup.sections[0]?.label
      : !engage?.setup?.showSectionFilter && engage?.setup?.sections.length === 1
        ? engage.setup.sections[0]?.label
        : null;

  return (
    <FeedbackShell
      title={mode === "create" ? "Create feedback form" : "Modify feedback form"}
      backHref={mode === "create" ? "/feedback" : "/feedback/modify-feedback-form"}
    >
      <div className="ann-form-shell mx-auto flex flex-col gap-6">
        <nav className="ann-wizard-steps" aria-label="Create feedback steps">
          {["Feedback type", "Audience", "Details", "Questions"].map((label, i) => (
            <span
              key={label}
              className={`ann-wizard-step${step === i + 1 ? " is-active" : ""}${step > i + 1 ? " is-complete" : ""}`}
            >
              <span className="ann-wizard-step-num">{i + 1}</span>
              {label}
            </span>
          ))}
        </nav>

        {step === 1 ? (
          <div className="db-card db-form ann-content-card grid gap-4">
            <label className="db-field">
              <span>Feedback type</span>
              <FormSelect value={formType} options={FORM_TYPES} onChange={setFormType} required />
            </label>
            {formType === "OTHER" ? (
              <label className="db-field">
                <span>Specify Feedback Type</span>
                <input className="db-input" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Describe the feedback category" />
              </label>
            ) : null}
            <div className="db-wf-actions">
              <WfBtn type="button" onClick={() => navigate("/feedback")}>
                Cancel
              </WfBtn>
              <WfBtn type="button" variant="primary" onClick={() => tryAdvance(2)}>
                Next
              </WfBtn>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="db-card db-form ann-content-card ann-scope-card grid gap-3">
            {portalVariant === "teacher" ? (
              <>
                <p>Select the section that should receive this feedback form.</p>
                {structureLocked ? (
                  <p className="text-sm text-amber-800">This form already has responses. Audience targeting is locked.</p>
                ) : null}
                {engage?.loading ? (
                  <ErpLoader label="Loading your sections…" size={56} />
                ) : engage?.loadError ? (
                  <p className="text-sm portal-text-muted">{engage.loadError}</p>
                ) : teacherFixedSectionLabel && !structureLocked ? (
                  <div className="htpo-engage-section-filter htpo-engage-section-filter--fixed">
                    <span className="htpo-engage-section-filter-label">Section</span>
                    <span className="htpo-engage-section-chip">{teacherFixedSectionLabel}</span>
                  </div>
                ) : (
                  <label className="db-field">
                    <span>Section</span>
                    <FormSelect
                      value={scope.sectionId}
                      options={teacherSectionOptions}
                      disabled={teacherSectionLocked}
                      onChange={(id) => setScope((p) => ({ ...p, sectionId: id }))}
                      required
                    />
                  </label>
                )}
                {!engage?.loading && !engage?.loadError && !(engage?.setup?.sections?.length ?? 0) ? (
                  <p className="text-sm portal-text-muted">No assigned sections found for your role.</p>
                ) : null}
              </>
            ) : (
              <>
                <p>Target audience — pick a department, then narrow by branch, batch, class, or section if needed</p>
                {structureLocked ? (
                  <p className="text-sm text-amber-800">This form already has responses. Audience targeting is locked.</p>
                ) : null}
                <label className="db-field">
                  <span>Department</span>
                  <FormSelect
                    value={scope.programId}
                    options={programSelectOptions}
                    disabled={structureLocked || st.programsLoading || !st.programs.length}
                    onChange={async (id) => {
                      const campusId = scope.campusId || (id ? (st.programs.find((p) => p.id === id)?.campusId ?? "") : "");
                      setScope((p) => ({ ...p, campusId, programId: id, branchId: "", batchId: "", classId: "", sectionId: "" }));
                      st.setBranches([]);
                      st.setBatches([]);
                      st.setClasses([]);
                      st.setSections([]);
                      if (id && campusId) await st.loadBranches(id, campusId);
                    }}
                  />
                </label>
                <label className="db-field">
                  <span>Branch</span>
                  <FormSelect
                    value={scope.branchId}
                    options={branchSelectOptions}
                    disabled={structureLocked || !scope.programId}
                    onChange={async (id) => {
                      setScope((p) => ({ ...p, branchId: id, batchId: "", classId: "", sectionId: "" }));
                      st.setBatches([]);
                      st.setClasses([]);
                      st.setSections([]);
                      const campusId = campusIdForProgram(scope.programId);
                      if (id && scope.programId && campusId) await st.loadBatches(id, scope.programId, campusId);
                    }}
                  />
                </label>
                <label className="db-field">
                  <span>Batch</span>
                  <FormSelect
                    value={scope.batchId}
                    options={batchSelectOptions}
                    disabled={structureLocked || !scope.branchId}
                    onChange={async (id) => {
                      setScope((p) => ({ ...p, batchId: id, classId: "", sectionId: "" }));
                      st.setClasses([]);
                      st.setSections([]);
                      if (id) await st.loadClasses(id);
                    }}
                  />
                </label>
                <label className="db-field">
                  <span>Class</span>
                  <FormSelect
                    value={scope.classId}
                    options={classSelectOptions}
                    disabled={structureLocked || !scope.batchId}
                    onChange={async (id) => {
                      setScope((p) => ({ ...p, classId: id, sectionId: "" }));
                      st.setSections([]);
                      if (id) await st.loadSections(id);
                    }}
                  />
                </label>
                <label className="db-field">
                  <span>Section</span>
                  <FormSelect
                    value={scope.sectionId}
                    options={sectionSelectOptions}
                    disabled={structureLocked || !scope.classId}
                    onChange={(id) => setScope((p) => ({ ...p, sectionId: id }))}
                  />
                </label>
              </>
            )}
            <div className="db-wf-actions">
              <WfBtn type="button" onClick={() => setStep(1)}>
                Back
              </WfBtn>
              <WfBtn type="button" variant="primary" onClick={() => tryAdvance(3)}>
                Next
              </WfBtn>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="db-card db-form ann-content-card grid gap-4">
            <label className="db-field">
              <span>Feedback Title</span>
              <input className="db-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="db-field">
              <span>Description / Instructions</span>
              <textarea className="db-input min-h-[120px]" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </label>
            <label className="db-field">
              <span>Start date</span>
              <input className="db-input" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label className="db-field">
              <span>End date</span>
              <input className="db-input" type="date" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} required />
            </label>
            <div className="fb-form-options grid gap-2" role="group" aria-label="Response settings">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Anonymous responses (identity hidden in reports)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowMultiple}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                />
                Allow multiple submissions per student
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!anonymous}
                  onChange={(e) => setAnonymous(!e.target.checked)}
                />
                Identify respondents in feedback reports (show student name and section for each response)
              </label>
            </div>
            <div className="db-wf-actions">
              <WfBtn type="button" onClick={() => setStep(2)}>
                Back
              </WfBtn>
              <WfBtn type="button" variant="primary" onClick={() => tryAdvance(4)}>
                Next
              </WfBtn>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="db-card db-form ann-content-card grid gap-4">
            <p className="ann-step-lead">Question builder</p>
            {questionsLocked ? (
              <p className="text-sm text-amber-800">This form already has responses. Questions cannot be changed.</p>
            ) : null}
            {questions.map((q, idx) => (
              <div key={q.localKey} className="fb-question-card">
                <div className="fb-question-card-head">
                  <div className="fb-question-card-type">
                    <FormSelect
                      value={q.type}
                      options={Q_TYPES}
                      disabled={questionsLocked}
                      onChange={(t) => setQuestions((list) => list.map((x) => (x.localKey === q.localKey ? { ...x, type: t } : x)))}
                      aria-label="Question type"
                    />
                  </div>
                  <RequiredToggle
                    checked={q.required}
                    onChange={(required) => setQuestions((list) => list.map((x) => (x.localKey === q.localKey ? { ...x, required } : x)))}
                    id={`fb-req-${q.localKey}`}
                  />
                  {!questionsLocked ? (
                  <div className="fb-question-card-actions">
                  <button type="button" className="db-icon-button" aria-label="Move question up" title="Move up" disabled={idx === 0} onClick={() => setQuestions((list) => {
                    const n = [...list];
                    [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                    return n;
                  })}>
                    <ChevronUp size={18} />
                  </button>
                  <button type="button" className="db-icon-button" aria-label="Move question down" title="Move down" disabled={idx === questions.length - 1} onClick={() => setQuestions((list) => {
                    const n = [...list];
                    [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                    return n;
                  })}>
                    <ChevronDown size={18} />
                  </button>
                  <button type="button" className="db-icon-button fb-question-card-delete" aria-label="Remove question" title="Remove question" onClick={() => setQuestions((list) => list.filter((x) => x.localKey !== q.localKey))}>
                    <Trash2 size={18} />
                  </button>
                  </div>
                  ) : null}
                </div>
                <input className="db-input mb-2" placeholder="Question text" value={q.prompt} readOnly={questionsLocked} onChange={(e) => setQuestions((list) => list.map((x) => (x.localKey === q.localKey ? { ...x, prompt: e.target.value } : x)))} />
                {q.type === "MULTIPLE_CHOICE" ? (
                  <textarea className="db-input min-h-[72px]" placeholder="One choice per line" value={q.choicesText} readOnly={questionsLocked} onChange={(e) => setQuestions((list) => list.map((x) => (x.localKey === q.localKey ? { ...x, choicesText: e.target.value } : x)))} />
                ) : null}
              </div>
            ))}
            {!questionsLocked ? (
              <WfBtn
                type="button"
                variant="primary"
                onClick={() =>
                  setQuestions((list) => [
                    ...list,
                    { localKey: `q${Date.now()}`, order: list.length, type: "RATING_SCALE", prompt: "", required: true, choicesText: "" }
                  ])
                }
              >
                Add question
              </WfBtn>
            ) : null}
            <div className="db-wf-actions">
              <WfBtn type="button" onClick={() => setStep(3)}>
                Back
              </WfBtn>
              <WfBtn type="button" variant="primary" disabled={saving} onClick={() => void publish()}>
                {saving ? "Saving…" : mode === "create" ? "Publish form" : "Save changes"}
              </WfBtn>
            </div>
          </div>
        ) : null}
      </div>
    </FeedbackShell>
  );
}

type FeedbackCompletionData = {
  formId: string;
  title: string;
  anonymous: boolean;
  totalTargeted: number;
  submittedCount: number;
  pendingCount: number;
  submitted: { studentProfileId: string; rollNumber: string; fullName: string; email: string; sectionName: string; submittedAt: string }[];
  pending: { studentProfileId: string; rollNumber: string; fullName: string; email: string; sectionName: string }[];
};

type ActiveFormRow = {
  id: string;
  title: string;
  formType: string;
  startsAt: string;
  endsAt: string;
  anonymous: boolean;
  totalResponses: number;
};

function FeedbackExportDialog({
  open,
  formTitle,
  onClose,
  onExport
}: {
  open: boolean;
  formTitle: string;
  onClose: () => void;
  onExport: (variant: FeedbackExportVariant) => Promise<void>;
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  if (!open) return null;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog fb-export-dialog"
        aria-modal="true"
        role="dialog"
        aria-labelledby="feedback-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="feedback-export-title">Export feedback</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="erp-export-dialog-lead">
          Choose what to export for <strong>{formTitle}</strong>.
        </p>
        <div className="erp-export-dialog-options fb-export-dialog-options">
          {FEEDBACK_EXPORT_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className="erp-export-option fb-export-option"
              disabled={Boolean(exporting)}
              onClick={() => {
                setExporting(format.id);
                void onExport(format.id).finally(() => setExporting(null));
              }}
            >
              <span className="fb-export-option-title">{exporting === format.id ? "Downloading…" : format.label}</span>
              <span className="fb-export-option-desc">{format.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeedbackCompletionDialog({
  open,
  data,
  loading,
  reminding,
  onClose,
  onRemind,
  canRemind = true
}: {
  open: boolean;
  data: FeedbackCompletionData | null;
  loading: boolean;
  reminding: boolean;
  onClose: () => void;
  onRemind: () => void;
  canRemind?: boolean;
}) {
  const [tab, setTab] = useState<"submitted" | "pending">("pending");
  if (!open) return null;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog fb-completion-dialog"
        aria-modal="true"
        role="dialog"
        aria-labelledby="feedback-completion-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="feedback-completion-title">Submission status</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {loading || !data ? (
          <div className="flex justify-center py-10">
            <ErpLoader label="Loading roster…" size={72} />
          </div>
        ) : (
          <>
            <p className="erp-export-dialog-lead m-0">
              <strong>{data.title}</strong> — {data.submittedCount} of {data.totalTargeted} students submitted.
              {data.anonymous ? (
                <span className="mt-2 block text-xs text-slate-600">
                  Answers stay anonymous in reports; this list is for completion tracking only.
                </span>
              ) : null}
            </p>
            <div className="fb-completion-tabs">
              <button type="button" className={tab === "pending" ? "is-active" : ""} onClick={() => setTab("pending")}>
                Pending ({data.pendingCount})
              </button>
              <button type="button" className={tab === "submitted" ? "is-active" : ""} onClick={() => setTab("submitted")}>
                Submitted ({data.submittedCount})
              </button>
            </div>
            <div className="fb-completion-list">
              {(tab === "pending" ? data.pending : data.submitted).length === 0 ? (
                <p className="m-0 py-6 text-center text-sm text-slate-500">No students in this group.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Roll</th>
                      <th>Name</th>
                      <th>Section</th>
                      {tab === "submitted" ? <th>Submitted</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "pending" ? data.pending : data.submitted).map((row) => (
                      <tr key={row.studentProfileId}>
                        <td>{row.rollNumber}</td>
                        <td>{row.fullName}</td>
                        <td>{row.sectionName}</td>
                        {tab === "submitted" ? (
                          <td>{formatIstLocaleDateTime((row as FeedbackCompletionData["submitted"][number]).submittedAt)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="fb-completion-actions">
              {canRemind ? (
                <WfBtn variant="primary" disabled={reminding || data.pendingCount === 0} onClick={() => void onRemind()}>
                  <Bell size={16} aria-hidden />
                  {reminding ? "Sending…" : `Remind ${data.pendingCount} pending`}
                </WfBtn>
              ) : null}
              <WfBtn onClick={onClose}>Close</WfBtn>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function FeedbackActiveFormsPage() {
  const navigate = useFeedbackNavigate();
  const paths = useFeedbackPaths();
  const { fetchJson, sendJson, authFetch } = useFeedbackApi();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const engage = useOptionalTeacherEngage();
  const { user } = useAuth();
  const canManage = !engage || canTeacherManageFeedback(user, engage.setup ?? null);
  const [items, setItems] = useState<ActiveFormRow[]>([]);
  const [exportTarget, setExportTarget] = useState<ActiveFormRow | null>(null);
  const [completionTarget, setCompletionTarget] = useState<ActiveFormRow | null>(null);
  const [completionData, setCompletionData] = useState<FeedbackCompletionData | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [reminding, setReminding] = useState(false);

  const load = useCallback(async (notify = false) => {
    try {
      const path = appendSectionQuery("/api/feedback/forms/active?pageSize=50", engage?.activeSectionId ?? "");
      const res = await fetchJson<{ items: ActiveFormRow[] }>(path);
      setItems(res.items);
      if (notify) {
        showToast(res.items.length ? `${res.items.length} active form(s) loaded` : "No active feedback forms", "info");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [engage?.activeSectionId, fetchJson, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!completionTarget) {
      setCompletionData(null);
      return;
    }
    void (async () => {
      setCompletionLoading(true);
      setCompletionData(null);
      try {
        const res = await fetchJson<FeedbackCompletionData>(`/api/feedback/forms/${completionTarget.id}/completion`);
        setCompletionData(res);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load completion", "error");
        setCompletionTarget(null);
      } finally {
        setCompletionLoading(false);
      }
    })();
  }, [completionTarget, fetchJson, showToast]);

  async function remindPending() {
    if (!completionTarget) return;
    const ok = await confirm({
      title: "Send reminder?",
      message: "Publish an in-app announcement to students who have not submitted this form.",
      itemName: completionTarget.title,
      confirmLabel: "Send reminder",
      tone: "primary",
      icon: Bell
    });
    if (!ok) return;
    setReminding(true);
    try {
      const res = await sendJson<{ remindedCount: number }>(`/api/feedback/forms/${completionTarget.id}/remind`, {}, "POST");
      showToast(res.remindedCount ? `Reminder published (${res.remindedCount} pending)` : "Everyone has already submitted");
      const fresh = await fetchJson<FeedbackCompletionData>(`/api/feedback/forms/${completionTarget.id}/completion`);
      setCompletionData(fresh);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reminder failed", "error");
    } finally {
      setReminding(false);
    }
  }

  return (
    <FeedbackShell title="Active Feedback Forms">
      <TeacherEngageSectionFilter className="mb-4" />
      <div className="mb-4 db-wf-actions">
        <WfBtn onClick={() => void load(true)}>Refresh</WfBtn>
        <WfBtn variant="primary" onClick={() => navigate("/feedback/feedback-reports")}>
          Open reports hub
        </WfBtn>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No active feedback forms right now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((row) => (
            <article key={row.id} className="db-card ann-content-card fb-active-form-card">
              <div className="fb-active-form-head">
                <h3 className="fb-form-card-title">{row.title}</h3>
                {row.anonymous ? <span className="fb-active-form-badge">Anonymous answers</span> : null}
              </div>
              <p className="fb-active-form-meta">{row.formType.replace(/_/g, " ")}</p>
              <p className="fb-active-form-meta">
                {formatIstLocaleDate(row.startsAt)} → {formatIstLocaleDate(row.endsAt)}
              </p>
              <p className="fb-active-form-stat">Submissions: {row.totalResponses}</p>
              <div className="fb-active-form-actions db-wf-actions">
                <WfBtn
                  onClick={() => navigate(paths.report(row.id), { state: { from: paths.active } })}
                >
                  <BarChart3 size={16} aria-hidden />
                  Analytics
                </WfBtn>
                <WfBtn onClick={() => setCompletionTarget(row)}>
                  <Users size={16} aria-hidden />
                  Who submitted?
                </WfBtn>
                <WfBtn onClick={() => setExportTarget(row)}>
                  <Download size={16} aria-hidden />
                  Export
                </WfBtn>
                {canManage ? (
                  <WfBtn
                    variant="danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Archive form?",
                        message: "The form moves to archive and stays recoverable.",
                        itemName: row.title,
                        confirmLabel: "Archive",
                        icon: Archive
                      });
                      if (!ok) return;
                      try {
                        await sendJson(`/api/feedback/forms/${row.id}/archive`, {}, "POST");
                        showToast("Form archived");
                        void load();
                      } catch (e) {
                        showToast(e instanceof Error ? e.message : "Archive failed", "error");
                      }
                    }}
                  >
                    <Archive size={16} aria-hidden />
                    Archive
                  </WfBtn>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      <FeedbackExportDialog
        open={Boolean(exportTarget)}
        formTitle={exportTarget?.title ?? ""}
        onClose={() => setExportTarget(null)}
        onExport={async (variant) => {
          if (!exportTarget) return;
          try {
            await downloadFeedbackExport(authFetch, exportTarget.id, variant, exportTarget.title);
            showToast("Export ready");
            setExportTarget(null);
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Export failed", "error");
          }
        }}
      />
      <FeedbackCompletionDialog
        open={Boolean(completionTarget)}
        data={completionData}
        loading={completionLoading}
        reminding={reminding}
        onClose={() => setCompletionTarget(null)}
        onRemind={() => void remindPending()}
        canRemind={canManage}
      />
      {dialog}
    </FeedbackShell>
  );
}

export function FeedbackArchivedPage() {
  const { fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const engage = useOptionalTeacherEngage();
  const [items, setItems] = useState<{ id: string; title: string; formType: string; totalResponses: number }[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const path = appendSectionQuery("/api/feedback/forms/archived?pageSize=50", engage?.activeSectionId ?? "");
        const res = await fetchJson<{ items: typeof items }>(path);
        setItems(res.items);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Load failed", "error");
      }
    })();
  }, [engage?.activeSectionId, fetchJson, showToast]);
  return (
    <FeedbackShell title="Archived Feedbacks">
      <TeacherEngageSectionFilter className="mb-4" />
      <div className="grid gap-3">
        {items.map((row) => (
          <div key={row.id} className="db-card">
            <strong>{row.title}</strong>
            <span className="ml-2 text-xs text-slate-500">{row.formType}</span>
            <p className="text-sm text-slate-600">Responses: {row.totalResponses}</p>
          </div>
        ))}
      </div>
    </FeedbackShell>
  );
}

export function FeedbackReportsHubPage() {
  const navigate = useFeedbackNavigate();
  const paths = useFeedbackPaths();
  const { fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const engage = useOptionalTeacherEngage();
  const [items, setItems] = useState<{ id: string; title: string; totalResponses: number }[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const path = appendSectionQuery("/api/feedback/forms/active?pageSize=100", engage?.activeSectionId ?? "");
        const res = await fetchJson<{ items: typeof items }>(path);
        setItems(res.items.map((i) => ({ id: i.id, title: i.title, totalResponses: i.totalResponses })));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Load failed", "error");
      }
    })();
  }, [engage?.activeSectionId, fetchJson, showToast]);
  return (
    <FeedbackShell title="Feedback Reports">
      <TeacherEngageSectionFilter className="mb-4" />
      <p className="mb-4 text-sm text-slate-600">Select a form to view backend-driven analytics and exports.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((row) => (
          <button
            key={row.id}
            type="button"
            className="fb-report-hub-card"
            onClick={() => navigate(paths.report(row.id), { state: { from: paths.reports } })}
          >
            <h3>{row.title}</h3>
            <p>{row.totalResponses} submissions</p>
          </button>
        ))}
      </div>
    </FeedbackShell>
  );
}

type ReportSummary = {
  title?: string;
  anonymous?: boolean;
  totalSubmissions: number;
  questionStats: { questionId: string; prompt: string; type: string; average?: number; distribution?: Record<string, number>; yes?: number; no?: number; choiceCounts?: Record<string, number>; responseCount?: number }[];
  insights: string[];
};

export function FeedbackReportDetailPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useFeedbackNavigate();
  const { authFetch, fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");

  useEffect(() => {
    if (!formId) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<{ formId: string; title: string } & ReportSummary>(`/api/feedback/forms/${formId}/report/summary`);
        setData(res);
        setFormTitle(res.title);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Report failed", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [formId, fetchJson, showToast]);

  if (loading || !data) {
    return (
      <FeedbackShell title="Feedback report">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
          <ErpLoader label="Generating analytics…" size={96} />
        </div>
      </FeedbackShell>
    );
  }

  return (
    <FeedbackShell title="Feedback analytics">
      <div className="fb-report mx-auto max-w-3xl">
        <div className="fb-report-hero">
          <h2>Report summary</h2>
          <p className="m-0 text-sm text-slate-600">Institutional feedback analytics (aggregated on the server).</p>
          <p className="m-0 mt-1 text-sm text-slate-600">
            {data.anonymous
              ? "Responses are anonymous — student names are hidden in exports and paragraph reviews."
              : "Respondent identities are shown in exports and paragraph reviews (name and section)."}
          </p>
          <p className="fb-report-metric mt-2">{data.totalSubmissions}</p>
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Total submissions</p>
        </div>
        <div className="fb-report-export db-wf-actions">
          <WfBtn variant="primary" className="fb-report-export-btn" onClick={() => setExportOpen(true)}>
            <Download size={16} aria-hidden />
            Export
          </WfBtn>
        </div>
        <ul className="fb-report-insights">
          {data.insights.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="grid gap-5">
          {data.questionStats.map((q) => (
            <div key={q.questionId} className="fb-report-q">
              <h3>{q.prompt}</h3>
              <p className="fb-report-q-type">{q.type.replace(/_/g, " ")}</p>
              {q.type === "RATING_SCALE" && q.distribution ? (
                <div className="fb-report-bars">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const c = q.distribution![String(star)] ?? 0;
                    const max = Math.max(1, ...Object.values(q.distribution!).map(Number));
                    const h = `${Math.round((c / max) * 100)}%`;
                    return (
                      <div key={star} className="fb-report-bar-track">
                        <div className="fb-report-bar-inner">
                          <div className="fb-report-bar-fill" style={{ height: h }} title={`${star}: ${c}`} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{star}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {q.type === "RATING_SCALE" && q.average != null ? (
                <p className="m-0 mt-2 text-sm font-medium text-slate-700">
                  Average: <span className="text-[var(--erp-blue)]">{q.average}</span> / 5
                </p>
              ) : null}
              {q.type === "YES_NO" ? (
                <p className="m-0 mt-2 text-sm text-slate-700">
                  Yes: {q.yes ?? 0} · No: {q.no ?? 0}
                </p>
              ) : null}
              {q.type === "MULTIPLE_CHOICE" && q.choiceCounts ? (
                <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm text-slate-700">
                  {Object.entries(q.choiceCounts).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
                      <span>{k}</span>
                      <strong className="text-[var(--erp-blue)]">{v}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
              {q.type === "PARAGRAPH" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="m-0 text-sm text-slate-600">Paragraph responses: {q.responseCount ?? 0}</p>
                  {(q.responseCount ?? 0) > 0 ? (
                    <WfBtn variant="primary" onClick={() => navigate(`/feedback/feedback-reports/${formId}/questions/${q.questionId}/paragraphs`)}>
                      Review text
                    </WfBtn>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <FeedbackExportDialog
        open={exportOpen}
        formTitle={formTitle || "Feedback form"}
        onClose={() => setExportOpen(false)}
        onExport={async (variant) => {
          if (!formId) return;
          try {
            await downloadFeedbackExport(authFetch, formId, variant, formTitle || "feedback");
            showToast("Export ready");
            setExportOpen(false);
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Export failed", "error");
          }
        }}
      />
    </FeedbackShell>
  );
}

type ParagraphRow = { id: string; text: string; submittedAt: string; student: { fullName: string; email: string; section: string } | null };

export function FeedbackParagraphAnswersPage() {
  const { formId, questionId } = useParams<{ formId: string; questionId: string }>();
  const { fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ParagraphRow[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!formId || !questionId) return;
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (appliedSearch.trim()) qs.set("answerSearch", appliedSearch.trim());
      const res = await fetchJson<{ items: ParagraphRow[]; total: number }>(
        `/api/feedback/forms/${formId}/questions/${questionId}/paragraphs?${qs}`
      );
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", "error");
    }
  }, [formId, questionId, page, appliedSearch, fetchJson, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FeedbackShell title="Paragraph responses" backHref={formId ? `/feedback/feedback-reports/${formId}` : "/feedback/feedback-reports"}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <form
          className="db-card db-form flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setAppliedSearch(search);
          }}
        >
          <input className="db-input min-w-[200px] flex-1" placeholder="Search answers…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="db-submit">
            Search
          </button>
        </form>
        <p className="text-sm text-slate-600">
          Showing {rows.length} of {total}
        </p>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          {rows.map((r) => (
            <article key={r.id} className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
              <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{r.text}</p>
              <p className="mt-2 text-xs text-slate-500">
                {formatIstLocaleDateTime(r.submittedAt)}
                {r.student ? ` · ${r.student.fullName} · ${r.student.section}` : " · Anonymous aggregate"}
              </p>
            </article>
          ))}
        </div>
        <div className="db-wf-actions">
          <WfBtn onClick={() => setPage((p) => (p > 1 ? p - 1 : p))}>Previous</WfBtn>
          <WfBtn onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}>Next</WfBtn>
        </div>
      </div>
    </FeedbackShell>
  );
}

type StudentFormRow = {
  id: string;
  title: string;
  formType: string;
  endsAt: string;
  alreadySubmitted: boolean;
  allowMultiple: boolean;
  questionCount: number;
};

type StudentQuestion = { id: string; type: string; prompt: string; required: boolean; options: unknown };

export function StudentFeedbackListPage() {
  const navigate = useNavigate();
  const { fetchJson } = useFeedbackApi();
  const { showToast } = useToast();
  const [items, setItems] = useState<StudentFormRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchJson<{ items: StudentFormRow[] }>("/api/feedback/student/available?pageSize=50");
        setItems(res.items);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Load failed", "error");
      }
    })();
  }, [fetchJson, showToast]);

  return (
    <FeedbackShell title="Feedback forms" backHref="/student">
      <p className="mb-4 text-sm text-slate-600">Only forms targeted to your campus, branch, batch, class, and section appear here.</p>
      <div className="grid gap-3">
        {items.map((row) => (
          <div key={row.id} className="db-card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">{row.title}</h3>
              <p className="text-xs text-slate-500">
                {row.formType.replace(/_/g, " ")} · Due {formatIstLocaleDate(row.endsAt)} · {row.questionCount} questions
              </p>
              {row.alreadySubmitted && !row.allowMultiple ? <span className="mt-1 inline-block text-xs font-bold text-amber-700">Submitted</span> : null}
            </div>
            <WfBtn
              variant="primary"
              onClick={() => {
                if (row.alreadySubmitted && !row.allowMultiple) {
                  showToast("You have already submitted this form.", "error");
                  return;
                }
                navigate(`/student/feedback/${row.id}`);
              }}
            >
              {row.alreadySubmitted && row.allowMultiple ? "Submit again" : "Open"}
            </WfBtn>
          </div>
        ))}
      </div>
    </FeedbackShell>
  );
}

export function StudentFeedbackFillPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { fetchJson, sendJson } = useFeedbackApi();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!formId) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<{ form: { title: string; description: string; questions: StudentQuestion[] } }>(`/api/feedback/forms/${formId}`);
        setTitle(res.form.title);
        setDescription(res.form.description);
        setQuestions(res.form.questions);
        const init: Record<string, unknown> = {};
        for (const q of res.form.questions) {
          if (q.type === "YES_NO") init[q.id] = false;
          else if (q.type === "RATING_SCALE") init[q.id] = 3;
          else init[q.id] = "";
        }
        setAnswers(init);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Unable to load form", "error");
        navigate("/student/feedback");
      } finally {
        setLoading(false);
      }
    })();
  }, [formId, fetchJson, navigate, showToast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formId) return;
    setSubmitting(true);
    try {
      const payloadAnswers: { questionId: string; value: unknown }[] = [];
      for (const q of questions) {
        const v = answers[q.id];
        if (q.type === "PARAGRAPH" || q.type === "MULTIPLE_CHOICE") {
          const s = String(v ?? "").trim();
          if (!q.required && !s.length) continue;
          payloadAnswers.push({ questionId: q.id, value: s });
        } else {
          payloadAnswers.push({ questionId: q.id, value: v });
        }
      }
      await sendJson(`/api/feedback/student/forms/${formId}/submit`, { answers: payloadAnswers }, "POST");
      showToast("Response submitted");
      navigate("/student/feedback");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <FeedbackShell title="Feedback" backHref="/student/feedback">
        <div className="flex min-h-[40vh] items-center justify-center">
          <ErpLoader label="Loading form…" size={88} />
        </div>
      </FeedbackShell>
    );
  }

  return (
    <FeedbackShell title={title || "Feedback"} backHref="/student/feedback">
      <form onSubmit={(e) => void handleSubmit(e)} className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="db-card whitespace-pre-wrap text-sm text-slate-700">{description}</div>
        {questions.map((q) => {
          const opts = (q.options ?? {}) as { choices?: string[]; minLabel?: string; maxLabel?: string };
          return (
            <div key={q.id} className="db-card db-form grid gap-3">
              <p className="font-semibold text-slate-900">
                {q.prompt}
                {q.required ? <span className="text-red-600"> *</span> : null}
              </p>
              {q.type === "RATING_SCALE" ? (
                <label className="db-field">
                  <span>
                    {opts.minLabel ?? "Poor"} → {opts.maxLabel ?? "Excellent"}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={Number(answers[q.id] ?? 3)}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: Number(e.target.value) }))}
                  />
                  <p className="text-sm font-bold">{Number(answers[q.id] ?? 3)}</p>
                </label>
              ) : null}
              {q.type === "YES_NO" ? (
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name={q.id} checked={answers[q.id] === true} onChange={() => setAnswers((a) => ({ ...a, [q.id]: true }))} /> Yes
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name={q.id} checked={answers[q.id] === false} onChange={() => setAnswers((a) => ({ ...a, [q.id]: false }))} /> No
                  </label>
                </div>
              ) : null}
              {q.type === "MULTIPLE_CHOICE" && opts.choices?.length ? (
                <div className="grid gap-2">
                  {opts.choices.map((c) => (
                    <label key={c} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                      <input type="radio" name={q.id} checked={answers[q.id] === c} onChange={() => setAnswers((a) => ({ ...a, [q.id]: c }))} />
                      {c}
                    </label>
                  ))}
                </div>
              ) : null}
              {q.type === "PARAGRAPH" ? (
                <textarea
                  className="db-input min-h-[120px]"
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Your answer"
                />
              ) : null}
            </div>
          );
        })}
        <button type="submit" className="db-submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit feedback"}
        </button>
        {submitting ? (
          <div className="flex justify-center py-4">
            <ErpLoader label="Submitting response…" size={80} />
          </div>
        ) : null}
      </form>
    </FeedbackShell>
  );
}

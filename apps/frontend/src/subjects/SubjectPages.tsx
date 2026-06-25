import { ArrowLeft, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { appendOwnedCampusFilter } from "../shared/existing-records-query.util";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";

type Campus = { id: string; code: string; name: string };
type Department = { id: string; campusId: string; name: string; code: string; durationYears: number };
type Branch = { id: string; departmentId: string; name: string; code: string };
type Batch = { id: string; batchCode: string; batch: string };
type ClassItem = { id: string; branchId: string; name: string; code: string; semesterNumber: number };
type SectionItem = { id: string; classId: string; name: string; code: string; class?: { id: string; name: string; code: string; semesterNumber: number } };
type SubjectSection = { id: string; name: string; code?: string | null; classId: string; class: { id: string; name: string; code?: string | null; semesterNumber: number } };
type Subject = { id: string; subjectName: string; subjectCode: string; semester: number; semesterLabel: string; department: Department; branch?: { id: string; name: string; code: string }; batch?: Batch | null; sections?: SubjectSection[] };
type PageResponse<T> = { items: T[]; total: number };
type SubjectFilter = { campusId: string; departmentId: string; branchId: string; classId: string; sectionId: string; semester: string };

export function SubjectsHomePage() {
  const navigate = useNavigate();

  return (
    <SubjectShell title="Subjects" variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate("/subjects/add-subject")}>Add Subject</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Subject Records">
        <OptionActionButton onClick={() => navigate("/subjects/modify-subject")}>Modify Subject</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/subjects/delete-subject")}>Delete Subject</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate("/subjects/existing-records")}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/subjects/history")}>History</OptionActionButton>
      </WorkflowSection>
    </SubjectShell>
  );
}

export function SubjectsExistingRecordsPage() {
  const data = useSubjectData();
  const [campusId, setCampusId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void data.loadCatalog({ campusId, search });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campusId, data.loadCatalog, search]);

  return (
    <WorkflowExistingRecordsPageShell title="Existing records">
      <ExistingRecordsPageIntro title="Subjects catalog" description="Browse subjects already saved in KIET ERP." />
      <ExistingRecordsPanel
        title="Subjects"
        total={data.subjectTotal}
        isLoading={data.isCatalogLoading}
        campusId={campusId}
        campusOptions={data.campuses.map((item) => [item.id, item.code])}
        onCampusChange={setCampusId}
        search={search}
        onSearchChange={setSearch}
        columns={[
          { header: "Department" },
          { header: "Branch" },
          { header: "Semester" },
          { header: "Code" },
          { header: "Subject" }
        ]}
        rows={data.subjects.map((subject) => ({
          id: subject.id,
          cells: [
            subject.department ? formatOptionLabel(subject.department.code, subject.department.name) : "-",
            subject.branch ? formatOptionLabel(subject.branch.code, subject.branch.name) : "-",
            subject.semesterLabel ?? `Sem ${subject.semester}`,
            subject.subjectCode,
            subject.subjectName
          ]
        }))}
      />
    </WorkflowExistingRecordsPageShell>
  );
}

export function AddSubjectPage() {
  const data = useSubjectData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ campusId: "", departmentId: "", branchId: "", batchId: "", semester: 1, subjectName: "", subjectCode: "" });
  const selectedDepartment = data.departments.find((item) => item.id === form.departmentId);
  useSubjectCascade(data, form, (patch) => setForm((current) => ({ ...current, ...patch })));
  const semesters = semesterOptions(selectedDepartment?.durationYears ?? 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await data.sendJson("/api/subjects", form);
      showToast("Subject created successfully");
      navigate("/subjects");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create subject", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SubjectShell title="Add Subject">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <SubjectHierarchy data={data} form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <Field label="Semester"><SearchableSelect value={String(form.semester)} onChange={(semester) => setForm({ ...form, semester: Number(semester) })} options={semesters.map((item) => [String(item.value), item.label])} searchable={false} /></Field>
        <Field label="Subject Name"><Input value={form.subjectName} onChange={(subjectName) => setForm({ ...form, subjectName })} required /></Field>
        <Field label="Subject ID / Subject Code"><Input value={form.subjectCode} onChange={(subjectCode) => setForm({ ...form, subjectCode })} required /></Field>
        <Submit saving={saving}>Create Subject</Submit>
      </form>
    </SubjectShell>
  );
}

export function ModifySubjectPage() {
  return <SubjectEdit mode="modify" />;
}

export function DeleteSubjectPage() {
  return <SubjectEdit mode="delete" />;
}

function SubjectEdit({ mode }: { mode: "modify" | "delete" }) {
  const data = useSubjectData();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SubjectFilter>({ campusId: "", departmentId: "", branchId: "", classId: "", sectionId: "", semester: "" });
  const [selected, setSelected] = useState<Subject | null>(null);
  const [form, setForm] = useState({ subjectName: "", subjectCode: "" });
  const [saving, setSaving] = useState(false);
  const canSearch = Boolean(filter.campusId && filter.departmentId && filter.branchId && filter.classId && filter.sectionId && filter.semester);
  useSubjectFilterCascade(data, filter, (patch) => setFilter((current) => ({ ...current, ...patch })));
  useEffect(() => {
    if (!canSearch) return;
    void data.searchSubjects("", filter);
  }, [canSearch, filter.campusId, filter.departmentId, filter.branchId, filter.classId, filter.sectionId, filter.semester, data.searchSubjects]);
  useEffect(() => { if (selected) setForm({ subjectName: selected.subjectName, subjectCode: selected.subjectCode }); }, [selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      setSelected(await data.sendJson(`/api/subjects/${selected.id}`, form, "PATCH"));
      showToast("Subject updated successfully");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update subject", "error");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!selected) return;
    const ok = await confirm({
      title: "Archive subject?",
      message: "The subject will be hidden from future selections.",
      itemName: selected.subjectName,
      confirmLabel: "Archive",
      icon: Trash2
    });
    if (!ok) return;
    try {
      await data.sendJson(`/api/subjects/${selected.id}`, {}, "DELETE");
      showToast("Subject archived successfully", "warning");
      navigate("/subjects");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive subject", "error");
    }
  }

  return (
    <SubjectShell title={mode === "modify" ? "Modify Subject" : "Delete Subject"}>
      <section className="db-card db-form">
        <SubjectFilterFields data={data} filter={filter} onChange={(patch) => { setSelected(null); setFilter({ ...filter, ...patch }); }} />
        {canSearch ? (
          <Field label="Select Subject">
            <SearchableSelect
              value={selected?.id ?? ""}
              onChange={(subjectId) => setSelected(data.subjects.find((item) => item.id === subjectId) ?? null)}
              options={data.subjects.map((item) => [item.id, `${item.subjectCode} - ${item.subjectName}`])}
              placeholder="Select Subject"
              searchable={false}
            />
          </Field>
        ) : null}
      </section>
      {selected && mode === "modify" ? (
        <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
          <SubjectDetails subject={selected} />
          <Field label="Subject Name"><Input value={form.subjectName} onChange={(subjectName) => setForm({ ...form, subjectName })} required /></Field>
          <Field label="Subject Code"><Input value={form.subjectCode} onChange={(subjectCode) => setForm({ ...form, subjectCode })} required /></Field>
          <Submit saving={saving}>Update Subject</Submit>
        </form>
      ) : null}
      {selected && mode === "delete" ? (
        <section className="db-card db-form">
          <SubjectDetails subject={selected} />
          <div className="db-archive-summary"><div><p>{selected.subjectName}</p><span>{selected.subjectCode}</span></div><button type="button" onClick={() => void archive()}><Trash2 size={18} /> Archive</button></div>
        </section>
      ) : null}
      {dialog}
    </SubjectShell>
  );
}

function useSubjectData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectTotal, setSubjectTotal] = useState(0);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const fetchJson = useCallback(async <T,>(path: string) => {
    const response = await authFetch(path);
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  }, [authFetch]);
  const sendJson = useCallback(async <T,>(path: string, body: unknown, method = "POST") => {
    const response = await authFetch(path, { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(body) });
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  }, [authFetch]);
  const loadCampuses = useCallback(async () => setCampuses((await fetchJson<PageResponse<Campus>>("/api/campuses?pageSize=100")).items), [fetchJson]);
  const loadDepartments = useCallback(async (campusId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (campusId) p.set("campusId", campusId); setDepartments((await fetchJson<PageResponse<Department>>(`/api/departments?${p}`)).items); }, [fetchJson]);
  const loadBranches = useCallback(async (departmentId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (departmentId) p.set("departmentId", departmentId); setBranches((await fetchJson<PageResponse<Branch>>(`/api/branches?${p}`)).items); }, [fetchJson]);
  const loadBatches = useCallback(async (branchId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (branchId) p.set("branchId", branchId); setBatches((await fetchJson<PageResponse<Batch>>(`/api/batches?${p}`)).items); }, [fetchJson]);
  const loadClasses = useCallback(async (branchId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (branchId) p.set("branchId", branchId); setClasses((await fetchJson<PageResponse<ClassItem>>(`/api/classes?${p}`)).items); }, [fetchJson]);
  const loadSections = useCallback(async (classId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (classId) p.set("classId", classId); setSections((await fetchJson<PageResponse<SectionItem>>(`/api/sections?${p}`)).items); }, [fetchJson]);
  const searchSubjects = useCallback(async (search: string, filter?: SubjectFilter) => {
    const p = new URLSearchParams({ pageSize: "100" });
    if (search.trim()) p.set("search", search.trim());
    appendOwnedCampusFilter(p, filter?.campusId);
    if (filter?.departmentId) p.set("departmentId", filter.departmentId);
    if (filter?.branchId) p.set("branchId", filter.branchId);
    if (filter?.classId) p.set("classId", filter.classId);
    if (filter?.sectionId) p.set("sectionId", filter.sectionId);
    if (filter?.semester) p.set("semester", filter.semester);
    const page = await fetchJson<PageResponse<Subject>>(`/api/subjects/filter?${p}`);
    setSubjects(page.items);
    setSubjectTotal(page.total);
    return page.items;
  }, [fetchJson]);
  const loadCatalog = useCallback(async (filters: { campusId?: string; search?: string }) => {
    setIsCatalogLoading(true);
    try {
      await searchSubjects(filters.search ?? "", filters.campusId ? { campusId: filters.campusId, departmentId: "", branchId: "", classId: "", sectionId: "", semester: "" } : undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load existing records", "error");
    } finally {
      setIsCatalogLoading(false);
    }
  }, [searchSubjects, showToast]);
  useEffect(() => { void loadCampuses().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load campuses", "error")); }, [loadCampuses, showToast]);
  return { campuses, departments, branches, batches, classes, sections, subjects, subjectTotal, isCatalogLoading, sendJson, loadDepartments, loadBranches, loadBatches, loadClasses, loadSections, searchSubjects, loadCatalog };
}

function useSubjectCascade(data: ReturnType<typeof useSubjectData>, form: { campusId: string; departmentId: string; branchId: string; batchId: string }, patch: (patch: Partial<typeof form>) => void) {
  useEffect(() => {
    if (form.campusId) {
      void data.loadDepartments(form.campusId);
    } else {
      patch({ departmentId: "", branchId: "", batchId: "" });
    }
  }, [form.campusId, data.loadDepartments]);
  useEffect(() => {
    if (form.departmentId) {
      void data.loadBranches(form.departmentId);
    } else {
      patch({ branchId: "", batchId: "" });
    }
  }, [form.departmentId, data.loadBranches]);
  useEffect(() => {
    if (form.branchId) {
      void data.loadBatches(form.branchId);
    } else {
      patch({ batchId: "" });
    }
  }, [form.branchId, data.loadBatches]);
}

function useSubjectFilterCascade(data: ReturnType<typeof useSubjectData>, filter: SubjectFilter, patch: (patch: Partial<SubjectFilter>) => void) {
  useEffect(() => {
    if (filter.campusId) {
      void data.loadDepartments(filter.campusId);
    } else {
      patch({ departmentId: "", branchId: "", classId: "", sectionId: "", semester: "" });
    }
  }, [filter.campusId, data.loadDepartments]);
  useEffect(() => {
    if (filter.departmentId) {
      void data.loadBranches(filter.departmentId);
    } else {
      patch({ branchId: "", classId: "", sectionId: "", semester: "" });
    }
  }, [filter.departmentId, data.loadBranches]);
  useEffect(() => {
    if (filter.branchId) {
      void data.loadClasses(filter.branchId);
    } else {
      patch({ classId: "", sectionId: "", semester: "" });
    }
  }, [filter.branchId, data.loadClasses]);
  useEffect(() => {
    if (filter.classId) {
      void data.loadSections(filter.classId);
    } else {
      patch({ sectionId: "", semester: "" });
    }
  }, [filter.classId, data.loadSections]);
  useEffect(() => {
    const selectedClass = data.classes.find((item) => item.id === filter.classId);
    if (filter.sectionId && selectedClass && filter.semester !== String(selectedClass.semesterNumber)) {
      patch({ semester: "" });
    }
  }, [data.classes, filter.classId, filter.sectionId, filter.semester]);
}

function SubjectFilterFields({ data, filter, onChange }: { data: ReturnType<typeof useSubjectData>; filter: SubjectFilter; onChange: (patch: Partial<SubjectFilter>) => void }) {
  const selectedClass = data.classes.find((item) => item.id === filter.classId);
  const semesterOptions = selectedClass ? [[String(selectedClass.semesterNumber), `Semester ${selectedClass.semesterNumber}`] as [string, string]] : [];
  return (
    <>
      <Field label="Select Campus"><SearchableSelect value={filter.campusId} onChange={(campusId) => onChange({ campusId, departmentId: "", branchId: "", classId: "", sectionId: "", semester: "" })} options={data.campuses.map((item) => [item.id, item.code])} placeholder="Select Campus" searchable={false} /></Field>
      <Field label="Select Department"><SearchableSelect value={filter.departmentId} onChange={(departmentId) => onChange({ departmentId, branchId: "", classId: "", sectionId: "", semester: "" })} options={data.departments.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Department" searchable={false} /></Field>
      <Field label="Select Branch"><SearchableSelect value={filter.branchId} onChange={(branchId) => onChange({ branchId, classId: "", sectionId: "", semester: "" })} options={data.branches.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Branch" searchable={false} /></Field>
      <Field label="Select Class"><SearchableSelect value={filter.classId} onChange={(classId) => onChange({ classId, sectionId: "", semester: "" })} options={data.classes.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Class" searchable={false} /></Field>
      <Field label="Select Section"><SearchableSelect value={filter.sectionId} onChange={(sectionId) => onChange({ sectionId, semester: "" })} options={data.sections.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Section" searchable={false} /></Field>
      <Field label="Select Semester"><SearchableSelect value={filter.semester} onChange={(semester) => onChange({ semester })} options={semesterOptions} placeholder="Select Semester" searchable={false} /></Field>
    </>
  );
}

function SubjectHierarchy({ data, form, onChange }: { data: ReturnType<typeof useSubjectData>; form: { campusId: string; departmentId: string; branchId: string; batchId: string }; onChange: (patch: Partial<typeof form>) => void }) {
  return (
    <>
      <Field label="Select Campus"><SearchableSelect value={form.campusId} onChange={(campusId) => onChange({ campusId, departmentId: "", branchId: "", batchId: "" })} options={data.campuses.map((item) => [item.id, item.code])} placeholder="Select Campus" searchable={false} /></Field>
      <Field label="Select Department"><SearchableSelect value={form.departmentId} onChange={(departmentId) => onChange({ departmentId, branchId: "", batchId: "" })} options={data.departments.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Department" searchable={false} /></Field>
      <Field label="Select Branch"><SearchableSelect value={form.branchId} onChange={(branchId) => onChange({ branchId, batchId: "" })} options={data.branches.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Branch" searchable={false} /></Field>
      <Field label="Select Batch"><SearchableSelect value={form.batchId} onChange={(batchId) => onChange({ batchId })} options={data.batches.map((item) => [item.id, item.batchCode || item.batch])} placeholder="Select Batch" searchable={false} /></Field>
    </>
  );
}

function semesterOptions(durationYears: number) {
  return Array.from({ length: durationYears * 2 }, (_, index) => {
    const semester = index + 1;
    return { value: semester, label: `${Math.ceil(semester / 2)}.${semester % 2 === 0 ? 2 : 1}` };
  });
}

function SubjectShell({ children, title, variant = "subpage" }: { children: ReactNode; title: string; variant?: "main" | "subpage" }) {
  const navigate = useNavigate();
  return <main className="db-workflow min-h-screen"><header className="db-workflow-header"><div className="db-header-left">{variant === "main" ? <AdminWorkflowMenuButton /> : <button className="db-icon-button" type="button" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>}<h1>{title}</h1></div><div className="db-header-actions"><ProfileMenuButton /></div></header><section className="db-workflow-body">{children}</section></main>;
}

function SubjectSuggestions({ items, onSelect }: { items: Subject[]; onSelect: (item: Subject) => void }) { return <div className="db-suggestions">{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)}><strong>{item.subjectName}</strong><span>{item.subjectCode}</span></button>)}</div>; }
function SubjectDetails({ subject }: { subject: Subject }) {
  const firstSection = subject.sections?.[0];
  return (
    <section className="db-detail-grid">
      <Info label="Subject" value={`${subject.subjectCode} - ${subject.subjectName}`} />
      <Info label="Semester" value={subject.semesterLabel ?? `Semester ${subject.semester}`} />
      <Info label="Department" value={subject.department ? formatOptionLabel(subject.department.code, subject.department.name) : "-"} />
      <Info label="Branch" value={subject.branch ? formatOptionLabel(subject.branch.code, subject.branch.name) : "-"} />
      <Info label="Class" value={firstSection?.class ? `${firstSection.class.name} / Sem ${firstSection.class.semesterNumber}` : "-"} />
      <Info label="Section" value={firstSection ? formatOptionLabel(firstSection.code ?? firstSection.name, firstSection.name) : "-"} />
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) { return <div className="db-info"><span>{label}</span><strong>{value}</strong></div>; }
function EmptyState({ children }: { children: ReactNode }) { return <p className="db-empty">{children}</p>; }
function formatOptionLabel(code: string, name: string) {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase() === name.replace(/[^A-Z0-9]/gi, "").toUpperCase()
    ? name
    : `${code} - ${name}`;
}
function GlassButton({ children, onClick, tone = "default" }: { children: ReactNode; onClick: () => void; tone?: "default" | "danger" }) {
  return <OptionActionButton tone={tone} onClick={onClick}>{children}</OptionActionButton>;
}
function ActionGroup({ children, title }: { children: ReactNode; title: string }) { return <WorkflowSection title={title}>{children}</WorkflowSection>; }
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="db-field"><span>{label}</span>{children}</label>; }
function Input({ onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />; }
function Submit({ children, saving }: { children: ReactNode; saving: boolean }) { return <button className="db-submit" disabled={saving}>{saving ? "Saving..." : children}</button>; }
async function responseError(response: Response) { const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null; const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message; return new Error(message || "Request failed."); }

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { appendOwnedCampusFilter } from "../shared/existing-records-query.util";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";

type Campus = { id: string; code: string; name: string };
type Department = { id: string; campusId: string; name: string; code: string };
type Branch = { id: string; departmentId: string; name: string; code: string };
type ClassItem = { id: string; branchId: string; name: string; code: string; semesterNumber: number };
type SectionItem = { id: string; classId: string; name: string; code: string };
type SubjectOption = { id: string; subjectName: string; subjectCode: string; semester?: number; semesterLabel?: string };
type SyllabusTopicRow = { id: string; topicTitle: string; topicOrder: number; isArchived?: boolean; archivedAt?: string | null };
type UnitRow = { id?: string; unitTitle: string; unitOrder?: number; topics: string[] };
type SyllabusUnitApi = { id?: string; unitTitle: string; unitOrder?: number; topics?: SyllabusTopicRow[] };
type Syllabus = { id: string; subjectId: string; subjectName: string; subjectCode: string; units: SyllabusUnitApi[] };
type PageResponse<T> = { items: T[]; total: number };
type SyllabusFilter = { campusId: string; departmentId: string; branchId: string; classId: string; sectionId: string; semester: string; subjectId: string };

const emptyUnit = (): UnitRow => ({ unitTitle: "", topics: [""] });
const emptyFilter = (): SyllabusFilter => ({ campusId: "", departmentId: "", branchId: "", classId: "", sectionId: "", semester: "", subjectId: "" });

function unitsForApi(units: UnitRow[]) {
  return units.map((unit, index) => ({
    id: unit.id,
    unitTitle: unit.unitTitle,
    unitOrder: unit.unitOrder ?? index + 1,
    topics: unit.topics
      .map((line) => line.trim())
      .filter(Boolean)
      .map((topicTitle) => ({ topicTitle }))
  }));
}

export function SyllabusHomePage() {
  const navigate = useNavigate();

  return (
    <SyllabusShell title="Syllabus" variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate("/syllabus/add-syllabus")}>Add Syllabus</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Syllabus Records">
        <OptionActionButton onClick={() => navigate("/syllabus/modify-syllabus")}>Modify Syllabus</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/syllabus/delete-syllabus")}>Delete Syllabus</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate("/syllabus/existing-records")}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/syllabus/history")}>History</OptionActionButton>
      </WorkflowSection>
    </SyllabusShell>
  );
}

export function SyllabusExistingRecordsPage() {
  const data = useSyllabusData();
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
      <ExistingRecordsPageIntro title="Syllabus catalog" description="Browse syllabus records already saved in KIET ERP." />
      <ExistingRecordsPanel
        title="Syllabus"
        total={data.syllabusTotal}
        isLoading={data.isCatalogLoading}
        campusId={campusId}
        campusOptions={data.campuses.map((item) => [item.id, item.code])}
        onCampusChange={setCampusId}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search subject code or name"
        columns={[
          { header: "Subject code" },
          { header: "Subject" },
          { header: "Units" },
          { header: "Topics" }
        ]}
        rows={data.syllabi.map((item) => ({
          id: item.id,
          cells: [
            item.subjectCode,
            item.subjectName,
            String(item.units.length),
            String(item.units.reduce((count, unit) => count + (unit.topics?.length ?? 0), 0))
          ]
        }))}
      />
    </WorkflowExistingRecordsPageShell>
  );
}

export function AddSyllabusPage() {
  const data = useSyllabusData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SyllabusFilter>(emptyFilter);
  const subject = data.subjects.find((item) => item.id === filter.subjectId) ?? null;
  const [units, setUnits] = useState<UnitRow[]>([emptyUnit()]);
  const [saving, setSaving] = useState(false);
  useSyllabusCascade(data, filter, (patch) => setFilter((current) => ({ ...current, ...patch })));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject) {
      showToast("Select a subject first.", "error");
      return;
    }
    setSaving(true);
    try {
      await data.sendJson("/api/syllabus", {
        subjectId: subject.id,
        units: unitsForApi(units)
      });
      showToast("Syllabus created successfully");
      navigate("/syllabus");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create syllabus", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SyllabusShell title="Add Syllabus">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <SyllabusHierarchy data={data} filter={filter} onChange={(patch) => setFilter({ ...filter, ...patch })} />
        {subject ? <SelectedSubject subject={subject} /> : null}
        <UnitRows units={units} onChange={setUnits} />
        <Submit saving={saving}>Create Syllabus</Submit>
      </form>
    </SyllabusShell>
  );
}

export function ModifySyllabusPage() {
  return <SyllabusEdit mode="modify" />;
}

export function DeleteSyllabusPage() {
  return <SyllabusEdit mode="delete" />;
}

function SyllabusEdit({ mode }: { mode: "modify" | "delete" }) {
  const data = useSyllabusData();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SyllabusFilter>(emptyFilter);
  const subject = data.subjects.find((item) => item.id === filter.subjectId) ?? null;
  const [selected, setSelected] = useState<Syllabus | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [saving, setSaving] = useState(false);
  useSyllabusCascade(data, filter, (patch) => setFilter((current) => ({ ...current, ...patch })));
  useEffect(() => {
    if (!filter.subjectId) {
      setSelected(null);
      return;
    }
    void data.loadSyllabus(filter.subjectId).then(setSelected).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load syllabus", "error"));
  }, [data.loadSyllabus, filter.subjectId, showToast]);
  useEffect(() => {
    if (selected) {
      setUnits(
        selected.units.length
          ? selected.units.map((unit) => ({
              id: unit.id,
              unitTitle: unit.unitTitle,
              unitOrder: unit.unitOrder,
              topics: unit.topics?.length ? unit.topics.map((t) => t.topicTitle) : [""]
            }))
          : [emptyUnit()]
      );
    }
  }, [selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      setSelected(await data.sendJson(`/api/syllabus/${selected.id}`, { units: unitsForApi(units) }, "PATCH"));
      showToast("Syllabus updated successfully");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update syllabus", "error");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!selected) return;
    const ok = await confirm({
      title: "Archive syllabus?",
      message: "All units in this syllabus will be archived.",
      itemName: subject?.subjectName,
      confirmLabel: "Archive",
      icon: Trash2
    });
    if (!ok) return;
    try {
      await data.sendJson(`/api/syllabus/${selected.id}`, {}, "DELETE");
      showToast("Syllabus archived successfully", "warning");
      navigate("/syllabus");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive syllabus", "error");
    }
  }

  return (
    <SyllabusShell title={mode === "modify" ? "Modify Syllabus" : "Delete Syllabus"}>
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <SyllabusHierarchy data={data} filter={filter} onChange={(patch) => setFilter({ ...filter, ...patch })} />
        {subject ? <SelectedSubject subject={subject} /> : null}
        {selected && mode === "modify" ? (
          <>
            <UnitRows units={units} onChange={setUnits} />
            <Submit saving={saving}>Update Syllabus</Submit>
          </>
        ) : null}
        {selected && mode === "delete" ? (
          <div className="db-archive-summary">
            <div>
              <p>{selected.subjectName}</p>
              <span>{selected.subjectCode}</span>
              {selected.units.map((unit) => (
                <div key={unit.id ?? unit.unitTitle}>
                  <span>
                    {unit.unitOrder}. {unit.unitTitle}
                  </span>
                  {unit.topics?.length ? (
                    <ul>
                      {unit.topics.map((t) => (
                        <li key={t.id}>{t.topicTitle}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void archive()}><Trash2 size={18} /> Archive</button>
          </div>
        ) : null}
        {!selected && filter.subjectId ? <p className="db-empty">No active syllabus found for this subject.</p> : null}
      </form>
      {dialog}
    </SyllabusShell>
  );
}

function UnitRows({ units, onChange }: { units: UnitRow[]; onChange: (units: UnitRow[]) => void }) {
  function update(index: number, unitTitle: string) {
    onChange(units.map((unit, unitIndex) => (unitIndex === index ? { ...unit, unitTitle, unitOrder: index + 1 } : unit)));
  }
  function updateTopic(unitIndex: number, topicIndex: number, value: string) {
    onChange(
      units.map((unit, index) =>
        index === unitIndex ? { ...unit, topics: unit.topics.map((topic, ti) => (ti === topicIndex ? value : topic)) } : unit
      )
    );
  }
  function addTopic(unitIndex: number) {
    onChange(units.map((unit, index) => (index === unitIndex ? { ...unit, topics: [...unit.topics, ""] } : unit)));
  }
  function removeTopic(unitIndex: number, topicIndex: number) {
    onChange(
      units.map((unit, index) =>
        index === unitIndex
          ? { ...unit, topics: unit.topics.length > 1 ? unit.topics.filter((_, ti) => ti !== topicIndex) : [""] }
          : unit
      )
    );
  }
  function addUnit() {
    onChange([...units, emptyUnit()]);
  }
  function removeUnit(index: number) {
    onChange(units.filter((_, unitIndex) => unitIndex !== index).map((row, rowIndex) => ({ ...row, unitOrder: rowIndex + 1 })));
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...units];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((unit, unitIndex) => ({ ...unit, unitOrder: unitIndex + 1 })));
  }
  return (
    <section className="db-branch-rows db-syllabus-units">
      <div className="db-branch-header">
        <h2>Units &amp; Topics</h2>
      </div>
      <p className="db-syllabus-hint">Structure: Subject → Syllabus → Units → Topics</p>
      {units.map((unit, index) => {
        const isLast = index === units.length - 1;
        return (
          <div className="db-branch-row db-syllabus-unit" key={unit.id ?? index}>
            <Field label={`Unit ${index + 1}`}>
              <Input value={unit.unitTitle} onChange={(value) => update(index, value)} required />
            </Field>
            <div className="db-syllabus-topics">
              <span className="db-syllabus-topics-label">Topics</span>
              {unit.topics.map((topic, topicIndex) => (
                <div className="db-syllabus-topic-row" key={topicIndex}>
                  <span className="db-syllabus-topic-num">Topic {topicIndex + 1}</span>
                  <Input value={topic} onChange={(value) => updateTopic(index, topicIndex, value)} placeholder="Topic name" />
                  <button
                    type="button"
                    className="db-syllabus-topic-del"
                    aria-label={`Delete topic ${topicIndex + 1}`}
                    onClick={() => removeTopic(index, topicIndex)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" className="db-syllabus-add-topic" onClick={() => addTopic(index)}>
                <Plus size={14} /> Add topic
              </button>
            </div>
            <div className="db-inline-actions">
              <button type="button" onClick={() => move(index, -1)}>
                Up
              </button>
              <button type="button" onClick={() => move(index, 1)}>
                Down
              </button>
              {units.length > 1 ? (
                <button type="button" onClick={() => removeUnit(index)}>
                  Remove unit
                </button>
              ) : null}
              {isLast ? (
                <button type="button" className="db-syllabus-add-unit-btn" onClick={addUnit}>
                  <Plus size={16} /> Add Unit
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function useSyllabusData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [syllabusTotal, setSyllabusTotal] = useState(0);
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
  const loadClasses = useCallback(async (branchId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (branchId) p.set("branchId", branchId); setClasses((await fetchJson<PageResponse<ClassItem>>(`/api/classes?${p}`)).items); }, [fetchJson]);
  const loadSections = useCallback(async (classId?: string) => { const p = new URLSearchParams({ pageSize: "100" }); if (classId) p.set("classId", classId); setSections((await fetchJson<PageResponse<SectionItem>>(`/api/sections?${p}`)).items); }, [fetchJson]);
  const loadSubjects = useCallback(async (filter: SyllabusFilter) => {
    const p = new URLSearchParams({ pageSize: "100", campusId: filter.campusId, departmentId: filter.departmentId, branchId: filter.branchId, classId: filter.classId, sectionId: filter.sectionId, semester: filter.semester });
    setSubjects((await fetchJson<PageResponse<SubjectOption>>(`/api/subjects/filter?${p}`)).items);
  }, [fetchJson]);
  const loadSyllabus = useCallback(async (subjectId: string) => {
    const p = new URLSearchParams({ pageSize: "1", subjectId });
    const page = await fetchJson<PageResponse<Syllabus>>(`/api/syllabus/search?${p}`);
    return page.items[0] ?? null;
  }, [fetchJson]);
  const loadCatalog = useCallback(async (filters: { campusId?: string; search?: string }) => {
    setIsCatalogLoading(true);
    try {
      const p = new URLSearchParams({ pageSize: "100" });
      appendOwnedCampusFilter(p, filters.campusId);
      if (filters.search?.trim()) p.set("search", filters.search.trim());
      const page = await fetchJson<PageResponse<Syllabus>>(`/api/syllabus/search?${p}`);
      setSyllabi(page.items);
      setSyllabusTotal(page.total);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load existing records", "error");
    } finally {
      setIsCatalogLoading(false);
    }
  }, [fetchJson, showToast]);
  useEffect(() => { void loadCampuses().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load campuses", "error")); }, [loadCampuses, showToast]);
  return { campuses, departments, branches, classes, sections, subjects, syllabi, syllabusTotal, isCatalogLoading, sendJson, loadDepartments, loadBranches, loadClasses, loadSections, loadSubjects, loadSyllabus, loadCatalog };
}

function useSyllabusCascade(data: ReturnType<typeof useSyllabusData>, filter: SyllabusFilter, patch: (patch: Partial<SyllabusFilter>) => void) {
  useEffect(() => {
    if (filter.campusId) void data.loadDepartments(filter.campusId);
    else patch({ departmentId: "", branchId: "", classId: "", sectionId: "", semester: "", subjectId: "" });
  }, [filter.campusId, data.loadDepartments]);
  useEffect(() => {
    if (filter.departmentId) void data.loadBranches(filter.departmentId);
    else patch({ branchId: "", classId: "", sectionId: "", semester: "", subjectId: "" });
  }, [filter.departmentId, data.loadBranches]);
  useEffect(() => {
    if (filter.branchId) void data.loadClasses(filter.branchId);
    else patch({ classId: "", sectionId: "", semester: "", subjectId: "" });
  }, [filter.branchId, data.loadClasses]);
  useEffect(() => {
    if (filter.classId) void data.loadSections(filter.classId);
    else patch({ sectionId: "", semester: "", subjectId: "" });
  }, [filter.classId, data.loadSections]);
  useEffect(() => {
    if (filter.campusId && filter.departmentId && filter.branchId && filter.classId && filter.sectionId && filter.semester) {
      void data.loadSubjects(filter);
    }
  }, [filter.campusId, filter.departmentId, filter.branchId, filter.classId, filter.sectionId, filter.semester, data.loadSubjects]);
}

function SyllabusHierarchy({ data, filter, onChange }: { data: ReturnType<typeof useSyllabusData>; filter: SyllabusFilter; onChange: (patch: Partial<SyllabusFilter>) => void }) {
  const selectedClass = data.classes.find((item) => item.id === filter.classId);
  const semesterOptions = selectedClass ? [[String(selectedClass.semesterNumber), `Semester ${selectedClass.semesterNumber}`] as [string, string]] : [];
  return (
    <>
      <Field label="Select Campus"><SearchableSelect value={filter.campusId} onChange={(campusId) => onChange({ campusId, departmentId: "", branchId: "", classId: "", sectionId: "", semester: "", subjectId: "" })} options={data.campuses.map((item) => [item.id, item.code])} placeholder="Select Campus" searchable={false} /></Field>
      <Field label="Select Department"><SearchableSelect value={filter.departmentId} onChange={(departmentId) => onChange({ departmentId, branchId: "", classId: "", sectionId: "", semester: "", subjectId: "" })} options={data.departments.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Department" searchable={false} /></Field>
      <Field label="Select Branch"><SearchableSelect value={filter.branchId} onChange={(branchId) => onChange({ branchId, classId: "", sectionId: "", semester: "", subjectId: "" })} options={data.branches.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Branch" searchable={false} /></Field>
      <Field label="Select Class"><SearchableSelect value={filter.classId} onChange={(classId) => onChange({ classId, sectionId: "", semester: "", subjectId: "" })} options={data.classes.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Class" searchable={false} /></Field>
      <Field label="Select Section"><SearchableSelect value={filter.sectionId} onChange={(sectionId) => onChange({ sectionId, semester: "", subjectId: "" })} options={data.sections.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Section" searchable={false} /></Field>
      <Field label="Select Semester"><SearchableSelect value={filter.semester} onChange={(semester) => onChange({ semester, subjectId: "" })} options={semesterOptions} placeholder="Select Semester" searchable={false} /></Field>
      <Field label="Select Subject"><SearchableSelect value={filter.subjectId} onChange={(subjectId) => onChange({ subjectId })} options={data.subjects.map((item) => [item.id, `${item.subjectCode} - ${item.subjectName}`])} placeholder="Select Subject" searchable={false} /></Field>
    </>
  );
}

function formatOptionLabel(code: string, name: string) {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase() === name.replace(/[^A-Z0-9]/gi, "").toUpperCase() ? name : `${code} - ${name}`;
}

function SelectedSubject({ subject }: { subject: SubjectOption }) {
  return <div className="db-card db-form"><div className="db-result-head"><div><h2>{subject.subjectName}</h2><p>{subject.subjectCode}</p></div></div></div>;
}

function SyllabusShell({ children, title, variant = "subpage" }: { children: ReactNode; title: string; variant?: "main" | "subpage" }) {
  const navigate = useNavigate();
  return <main className="db-workflow min-h-screen"><header className="db-workflow-header"><div className="db-header-left">{variant === "main" ? <AdminWorkflowMenuButton /> : <button className="db-icon-button" type="button" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>}<h1>{title}</h1></div><div className="db-header-actions"><ProfileMenuButton /></div></header><section className="db-workflow-body">{children}</section></main>;
}

function GlassButton({ children, onClick, tone = "default" }: { children: ReactNode; onClick: () => void; tone?: "default" | "danger" }) {
  return <OptionActionButton tone={tone} onClick={onClick}>{children}</OptionActionButton>;
}
function ActionGroup({ children, title }: { children: ReactNode; title: string }) { return <WorkflowSection title={title}>{children}</WorkflowSection>; }
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="db-field"><span>{label}</span>{children}</label>; }
function Input({ onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />; }
function Submit({ children, saving }: { children: ReactNode; saving: boolean }) { return <button className="db-submit" disabled={saving}>{saving ? "Saving..." : children}</button>; }
async function responseError(response: Response) { const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null; const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message; return new Error(message || "Request failed."); }

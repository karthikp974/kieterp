import { ArrowLeft, Copy, Download, Mail, Phone, Trash2 } from "lucide-react";
import { istYear } from "../shared/ist-time";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { appendOwnedCampusFilter } from "../shared/existing-records-query.util";
import { useToast } from "../shared/toast-context";

type Campus = { id: string; code: string; name: string };
type Department = { id: string; name: string; code: string; durationYears: number };
type Branch = { id: string; departmentId: string; name: string; code: string };
type ClassItem = { id: string; name: string; code: string };
type SectionItem = { id: string; classId: string; name: string; code: string };
type StudentRow = { id: string; name: string; rollNumber: string; phone?: string | null; email: string; classSection: string; semester: number; fees: { amount: number; status: "Paid" | "Unpaid" } };
type TeacherRow = { name: string; employeeCode: string };
type BatchItem = {
  id: string;
  departmentId: string;
  branchId: string;
  startYear: number;
  endYear: number;
  batch: string;
  batchCode: string;
  department: Department;
  branch: { id: string; name: string; code: string };
  classes: ClassItem[];
  sections: SectionItem[];
  teachers?: { htpo: TeacherRow[]; ctpo: TeacherRow[]; stpo: TeacherRow[] };
  students?: StudentRow[];
};
type PageResponse<T> = { items: T[]; total: number };

export function BatchesHomePage() {
  const navigate = useNavigate();

  return (
    <BatchShell title="Batches" variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate("/batches/add-batch")}>Add Batch</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Batch Records">
        <OptionActionButton onClick={() => navigate("/batches/modify-batch")}>Modify Batch</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/batches/delete-batch")}>Delete Batch</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate("/batches/existing-records")}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/batches/history")}>History</OptionActionButton>
      </WorkflowSection>
    </BatchShell>
  );
}

export function BatchesExistingRecordsPage() {
  const data = useBatchData();
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
      <ExistingRecordsPageIntro title="Batches catalog" description="Browse batches already saved in KIET ERP." />
      <ExistingRecordsPanel
        title="Batches"
        total={data.batchTotal}
        isLoading={data.isCatalogLoading}
        campusId={campusId}
        campusOptions={data.campuses.map((item) => [item.id, item.code])}
        onCampusChange={setCampusId}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search batch code"
        columns={[
          { header: "Department" },
          { header: "Branch" },
          { header: "Years" },
          { header: "Batch" },
          { header: "Batch code" }
        ]}
        rows={data.batches.map((batch) => ({
          id: batch.id,
          cells: [
            formatOptionLabel(batch.department.code, batch.department.name),
            formatOptionLabel(batch.branch.code, batch.branch.name),
            `${batch.startYear}-${batch.endYear}`,
            batch.batch,
            batch.batchCode
          ]
        }))}
      />
    </WorkflowExistingRecordsPageShell>
  );
}

export function AddBatchPage() {
  const data = useBatchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ departmentId: "", branchId: "", classId: "", sectionId: "", startYear: istYear(new Date()), batchCode: "" });
  const selectedDepartment = data.departments.find((item) => item.id === form.departmentId);
  const endYear = form.startYear + (selectedDepartment?.durationYears ?? 0);
  useBatchCascade(data, form, (patch) => setForm((current) => ({ ...current, ...patch })));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await data.sendJson("/api/batches", form);
      showToast("Batch created successfully");
      navigate("/batches");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create batch", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BatchShell title="Add Batch">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <BatchHierarchy data={data} form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <Field label="Start Year"><Input type="number" value={String(form.startYear)} onChange={(value) => setForm({ ...form, startYear: Number(value) })} required /></Field>
        <Field label="End Year"><Input value={String(endYear || "")} onChange={() => undefined} readOnly /></Field>
        <Field label="Batch ID / Batch Code"><Input value={form.batchCode} onChange={(batchCode) => setForm({ ...form, batchCode })} required /></Field>
        <Submit saving={saving}>Create Batch</Submit>
      </form>
    </BatchShell>
  );
}

export function ModifyBatchPage() {
  const data = useBatchData();
  const { showToast } = useToast();
  const [selection, setSelection] = useState({ departmentId: "", branchId: "", batchId: "" });
  const [selected, setSelected] = useState<BatchItem | null>(null);
  const [batchCode, setBatchCode] = useState("");
  const [saving, setSaving] = useState(false);

  useBatchPickerCascade(data, selection, (patch) => setSelection((current) => ({ ...current, ...patch })));

  useEffect(() => {
    if (!selection.batchId) {
      setSelected(null);
      return;
    }
    void data.batchDetails(selection.batchId).then(setSelected).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load batch", "error"));
  }, [selection.batchId, data.batchDetails, showToast]);

  useEffect(() => {
    if (selected) setBatchCode(selected.batchCode);
  }, [selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      setSelected(await data.sendJson(`/api/batches/${selected.id}`, { batchCode }, "PATCH"));
      showToast("Batch updated successfully");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update batch", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BatchShell title="Modify Batch">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <BatchPickerSelects data={data} value={selection} onChange={(patch) => setSelection({ ...selection, ...patch })} />
        {selected ? (
          <>
            <Field label="Batch Code"><Input value={batchCode} onChange={setBatchCode} required /></Field>
            <Submit saving={saving}>Update Batch</Submit>
          </>
        ) : (
          <EmptyState>Select a batch to modify.</EmptyState>
        )}
      </form>
    </BatchShell>
  );
}

export function DeleteBatchPage() {
  const data = useBatchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selection, setSelection] = useState({ departmentId: "", branchId: "", batchId: "" });
  const [selected, setSelected] = useState<BatchItem | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useBatchPickerCascade(data, selection, (patch) => setSelection((current) => ({ ...current, ...patch })));

  useEffect(() => {
    if (!selection.batchId) {
      setSelected(null);
      return;
    }
    void data.batchDetails(selection.batchId).then(setSelected).catch((error) => showToast(error instanceof Error ? error.message : "Unable to load batch", "error"));
  }, [selection.batchId, data.batchDetails, showToast]);

  async function archive() {
    if (!selected) return;
    try {
      await data.sendJson(`/api/batches/${selected.id}`, {}, "DELETE");
      setIsConfirmOpen(false);
      showToast("Batch archived successfully", "danger");
      navigate("/batches");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive batch", "error");
    }
  }

  return (
    <BatchShell title="Delete Batch">
      <div className="db-card db-form">
        <BatchPickerSelects data={data} value={selection} onChange={(patch) => setSelection({ ...selection, ...patch })} />
        {selected ? (
          <div className="db-archive-summary">
            <div>
              <p>{selected.batch}</p>
              <span>{selected.batchCode}</span>
            </div>
            <button type="button" onClick={() => setIsConfirmOpen(true)}>
              <Trash2 size={18} /> Archive
            </button>
          </div>
        ) : (
          <EmptyState>Select a batch to archive.</EmptyState>
        )}
      </div>
      <ConfirmArchiveDialog
        isOpen={isConfirmOpen}
        title="Archive batch?"
        message="This batch will be hidden from future selections. Existing linked records stay safe."
        itemName={selected ? `${selected.batchCode} - ${selected.batch}` : undefined}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={archive}
      />
    </BatchShell>
  );
}

function BatchDetails({ batch, onExport }: { batch: BatchItem; onExport: (id: string, format: string) => void }) {
  const firstClass = batch.classes[0];
  const firstSection = batch.sections[0];
  return (
    <section className="db-card db-form">
      <div className="db-result-head">
        <div>
          <h2>{batch.batch}</h2>
          <p>{batch.batchCode}</p>
        </div>
        <div className="db-export-actions">
          {["excel", "google-sheets", "csv", "pdf", "docx"].map((format) => <button type="button" key={format} onClick={() => onExport(batch.id, format)}><Download size={14} /> {format}</button>)}
        </div>
      </div>
      <div className="db-detail-grid">
        <Info label="Class Name" value={firstClass?.name ?? "-"} />
        <Info label="Class ID" value={firstClass?.code ?? "-"} />
        <Info label="Section Name" value={firstSection?.name ?? "-"} />
        <Info label="Section ID" value={firstSection?.code ?? "-"} />
        <Info label="Batch" value={batch.batch} />
        <Info label="Batch ID" value={batch.batchCode} />
        <Info label="HTPO names + IDs" value={formatTeachers(batch.teachers?.htpo)} />
        <Info label="CTPO names + IDs" value={formatTeachers(batch.teachers?.ctpo)} />
        <Info label="STPO names + IDs" value={formatTeachers(batch.teachers?.stpo)} />
      </div>
      <div className="admin-table-wrap">
        <table className="db-table">
          <thead><tr><th>Name</th><th>Roll Number</th><th>Phone Number</th><th>Gmail</th><th>Class/Section</th><th>Batch</th><th>Semester (current)</th><th>Fees</th><th>Action</th></tr></thead>
          <tbody>{(batch.students ?? []).map((student) => <StudentRowView key={student.id} student={student} batch={batch.batch} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StudentRowView({ batch, student }: { batch: string; student: StudentRow }) {
  const { showToast } = useToast();
  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    showToast(message, "info");
  }
  return (
    <tr>
      <td>{student.name}</td><td>{student.rollNumber}</td>
      <td><div className="db-inline-actions"><span>{student.phone ?? "-"}</span>{student.phone ? <><button onClick={() => void copy(student.phone ?? "", "Phone copied")}><Copy size={13} /></button><a href={`tel:${student.phone}`}><Phone size={13} /></a></> : null}</div></td>
      <td><div className="db-inline-actions"><span>{student.email}</span><button onClick={() => void copy(student.email, "Gmail copied")}><Copy size={13} /></button><a href={`mailto:${student.email}`}><Mail size={13} /></a></div></td>
      <td>{student.classSection}</td><td>{batch}</td><td>{student.semester}</td><td>{student.fees.amount}</td><td>{student.fees.status}</td>
    </tr>
  );
}

function useBatchData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
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
  const loadDepartments = useCallback(async () => setDepartments((await fetchJson<PageResponse<Department>>("/api/departments?pageSize=100")).items), [fetchJson]);
  const loadBranches = useCallback(async (departmentId?: string) => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (departmentId) params.set("departmentId", departmentId);
    setBranches((await fetchJson<PageResponse<Branch>>(`/api/branches?${params}`)).items);
  }, [fetchJson]);
  const loadClasses = useCallback(async (branchId?: string) => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (branchId) params.set("branchId", branchId);
    setClasses((await fetchJson<PageResponse<ClassItem>>(`/api/classes?${params}`)).items);
  }, [fetchJson]);
  const loadSections = useCallback(async (classId?: string) => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (classId) params.set("classId", classId);
    setSections((await fetchJson<PageResponse<SectionItem>>(`/api/sections?${params}`)).items);
  }, [fetchJson]);
  const loadBatches = useCallback(async (departmentId?: string, branchId?: string) => {
    if (!branchId) {
      setBatches([]);
      setBatchTotal(0);
      return [];
    }
    const params = new URLSearchParams({ pageSize: "100" });
    if (departmentId) params.set("departmentId", departmentId);
    params.set("branchId", branchId);
    const page = await fetchJson<PageResponse<BatchItem>>(`/api/batches?${params}`);
    setBatches(page.items);
    setBatchTotal(page.total);
    return page.items;
  }, [fetchJson]);
  const loadCatalog = useCallback(async (filters: { campusId?: string; search?: string }) => {
    setIsCatalogLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      appendOwnedCampusFilter(params, filters.campusId);
      if (filters.search?.trim()) params.set("search", filters.search.trim());
      const page = await fetchJson<PageResponse<BatchItem>>(`/api/batches?${params}`);
      setBatches(page.items);
      setBatchTotal(page.total);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load existing records", "error");
    } finally {
      setIsCatalogLoading(false);
    }
  }, [fetchJson, showToast]);
  const batchDetails = useCallback((id: string) => fetchJson<BatchItem>(`/api/batches/${id}`), [fetchJson]);
  const downloadExport = useCallback((id: string, format: string) => window.open(`/api/batches/${id}/export?format=${format}`, "_blank", "noopener,noreferrer"), []);
  useEffect(() => {
    void Promise.all([loadCampuses(), loadDepartments()]).catch((error) =>
      showToast(error instanceof Error ? error.message : "Unable to load batch options", "error")
    );
  }, [loadCampuses, loadDepartments, showToast]);
  return { campuses, departments, branches, classes, sections, batches, batchTotal, isCatalogLoading, sendJson, loadBranches, loadClasses, loadSections, loadBatches, loadCatalog, batchDetails, downloadExport };
}

function useBatchPickerCascade(
  data: ReturnType<typeof useBatchData>,
  selection: { departmentId: string; branchId: string; batchId: string },
  patch: (patch: Partial<{ departmentId: string; branchId: string; batchId: string }>) => void
) {
  useEffect(() => {
    if (selection.departmentId) {
      void data.loadBranches(selection.departmentId);
    } else {
      patch({ branchId: "", batchId: "" });
      void data.loadBatches();
    }
  }, [selection.departmentId, data.loadBranches, data.loadBatches, patch]);
  useEffect(() => {
    if (selection.branchId) {
      void data.loadBatches(selection.departmentId, selection.branchId);
    } else {
      patch({ batchId: "" });
    }
  }, [selection.branchId, selection.departmentId, data.loadBatches, patch]);
}

function BatchPickerSelects({
  data,
  value,
  onChange
}: {
  data: ReturnType<typeof useBatchData>;
  value: { departmentId: string; branchId: string; batchId: string };
  onChange: (patch: Partial<{ departmentId: string; branchId: string; batchId: string }>) => void;
}) {
  return (
    <>
      <Field label="Select Department">
        <SearchableSelect
          value={value.departmentId}
          onChange={(departmentId) => onChange({ departmentId, branchId: "", batchId: "" })}
          options={data.departments.map((item) => [item.id, formatOptionLabel(item.code, item.name)])}
          placeholder="Select Department"
          searchable={false}
        />
      </Field>
      <Field label="Select Branch">
        <SearchableSelect
          value={value.branchId}
          onChange={(branchId) => onChange({ branchId, batchId: "" })}
          options={data.branches.map((item) => [item.id, formatOptionLabel(item.code, item.name)])}
          placeholder="Select Branch"
          searchable={false}
          disabled={!value.departmentId}
        />
      </Field>
      <Field label="Select Batch">
        <SearchableSelect
          value={value.batchId}
          onChange={(batchId) => onChange({ batchId })}
          options={data.batches.map((item) => [item.id, `${item.batchCode} — ${item.batch}`])}
          placeholder="Select Batch"
          searchable={false}
          disabled={!value.branchId}
        />
      </Field>
    </>
  );
}

function useBatchCascade(data: ReturnType<typeof useBatchData>, form: { departmentId: string; branchId: string; classId: string; sectionId: string }, patch: (patch: Partial<typeof form>) => void) {
  useEffect(() => {
    if (form.departmentId) {
      void data.loadBranches(form.departmentId);
    } else {
      patch({ branchId: "", classId: "", sectionId: "" });
    }
  }, [form.departmentId, data.loadBranches]);
  useEffect(() => {
    if (form.branchId) {
      void data.loadClasses(form.branchId);
    } else {
      patch({ classId: "", sectionId: "" });
    }
  }, [form.branchId, data.loadClasses]);
  useEffect(() => {
    if (form.classId) {
      void data.loadSections(form.classId);
    } else {
      patch({ sectionId: "" });
    }
  }, [form.classId, data.loadSections]);
}

function BatchHierarchy({ data, form, onChange }: { data: ReturnType<typeof useBatchData>; form: { departmentId: string; branchId: string; classId: string; sectionId: string }; onChange: (patch: Partial<typeof form>) => void }) {
  return (
    <>
      <Field label="Select Department"><SearchableSelect value={form.departmentId} onChange={(departmentId) => onChange({ departmentId, branchId: "", classId: "", sectionId: "" })} options={data.departments.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Department" searchable={false} /></Field>
      <Field label="Select Branch"><SearchableSelect value={form.branchId} onChange={(branchId) => onChange({ branchId, classId: "", sectionId: "" })} options={data.branches.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Branch" searchable={false} /></Field>
      <Field label="Select Class"><SearchableSelect value={form.classId} onChange={(classId) => onChange({ classId, sectionId: "" })} options={data.classes.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Class" searchable={false} /></Field>
      <Field label="Select Section"><SearchableSelect value={form.sectionId} onChange={(sectionId) => onChange({ sectionId })} options={data.sections.map((item) => [item.id, formatOptionLabel(item.code, item.name)])} placeholder="Select Section" searchable={false} /></Field>
    </>
  );
}

function BatchShell({ children, title, variant = "subpage" }: { children: ReactNode; title: string; variant?: "main" | "subpage" }) {
  const navigate = useNavigate();
  return <main className="db-workflow min-h-screen"><header className="db-workflow-header"><div className="db-header-left">{variant === "main" ? <AdminWorkflowMenuButton /> : <button className="db-icon-button" type="button" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>}<h1>{title}</h1></div><div className="db-header-actions"><ProfileMenuButton /></div></header><section className="db-workflow-body">{children}</section></main>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="db-empty">{children}</p>;
}

function ConfirmArchiveDialog({
  isOpen,
  itemName,
  message,
  onCancel,
  onConfirm,
  title
}: {
  isOpen: boolean;
  itemName?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  if (!isOpen) return null;
  return (
    <div className="erp-confirm-overlay" role="presentation">
      <section className="erp-confirm-card" aria-modal="true" role="dialog" aria-labelledby="batch-archive-dialog-title">
        <div className="erp-confirm-icon"><Trash2 size={24} /></div>
        <h2 id="batch-archive-dialog-title">{title}</h2>
        <p>{message}</p>
        {itemName ? <strong>{itemName}</strong> : null}
        <div className="erp-confirm-actions">
          <button className="erp-confirm-cancel" type="button" onClick={onCancel}>Cancel</button>
          <button className="erp-confirm-danger" type="button" onClick={() => void onConfirm()}>
            <Trash2 size={16} /> Archive
          </button>
        </div>
      </section>
    </div>
  );
}
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
function Info({ label, value }: { label: string; value: string }) { return <div className="db-info"><span>{label}</span><strong>{value}</strong></div>; }
function formatTeachers(rows?: TeacherRow[]) { return rows?.map((item) => `${item.name} (${item.employeeCode})`).join(", ") || "-"; }
async function responseError(response: Response) { const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null; const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message; return new Error(message || "Request failed."); }

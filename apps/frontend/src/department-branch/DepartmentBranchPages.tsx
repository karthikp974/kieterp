import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { appendOwnedCampusFilter } from "../shared/existing-records-query.util";
import { useToast } from "../shared/toast-context";

type Campus = { id: string; code: string; name: string };
type BranchRow = { id?: string; name: string; code: string };
type Department = {
  id: string;
  campusId: string;
  name: string;
  code: string;
  durationYears: number;
  branches: BranchRow[];
  campus?: { id: string; code: string; name: string };
};
type Branch = {
  id: string;
  campusId: string;
  departmentId: string;
  name: string;
  code: string;
  campus?: { id: string; code: string; name: string };
  department: { id: string; name: string; code: string };
};
type PageResponse<T> = { items: T[]; total: number };

const emptyBranch = (): BranchRow => ({ name: "", code: "" });

export function DepartmentBranchHomePage() {
  const navigate = useNavigate();

  return (
    <FocusedShell title="Department & Branch" variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate("/department-branch/add-department")}>Add Department</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/department-branch/add-branch")}>Add Branch</OptionActionButton>
      </WorkflowSection>

      <WorkflowSection title="Departments">
        <OptionActionButton onClick={() => navigate("/department-branch/modify-department")}>Modify Department</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/department-branch/delete-department")}>Delete Department</OptionActionButton>
      </WorkflowSection>

      <WorkflowSection title="Branches">
        <OptionActionButton onClick={() => navigate("/department-branch/modify-branch")}>Modify Branch</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/department-branch/delete-branch")}>Delete Branch</OptionActionButton>
      </WorkflowSection>

      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate("/department-branch/existing-records")}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/department-branch/history")}>History</OptionActionButton>
      </WorkflowSection>
    </FocusedShell>
  );
}

export function DepartmentBranchExistingRecordsPage() {
  const data = useDepartmentBranchData();
  const { campuses, departments, branches, departmentTotal, branchTotal, isCatalogLoading, loadCatalog } = data;
  const [campusId, setCampusId] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [branchSearch, setBranchSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalog({ campusId, departmentSearch, branchSearch });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [branchSearch, campusId, departmentSearch, loadCatalog]);

  return (
    <WorkflowExistingRecordsPageShell title="Existing records">
      <ExistingRecordsPageIntro
        title="Department & Branch catalog"
        description="Browse departments and branches already saved in KIET ERP."
      />
      <div className="db-existing-records-stack">
        <ExistingRecordsPanel
          title="Departments"
          total={departmentTotal}
          isLoading={isCatalogLoading}
          campusId={campusId}
          campusOptions={campuses.map((campus) => [campus.id, campus.code])}
          onCampusChange={setCampusId}
          search={departmentSearch}
          onSearchChange={setDepartmentSearch}
          columns={[
            { header: "Campus" },
            { header: "Code" },
            { header: "Department" },
            { header: "Years" },
            { header: "Branches" }
          ]}
          rows={departments.map((department) => ({
            id: department.id,
            cells: [
              department.campus?.code ?? "-",
              department.code,
              department.name,
              String(department.durationYears),
              String(department.branches.length)
            ]
          }))}
        />
        <ExistingRecordsPanel
          title="Branches"
          total={branchTotal}
          isLoading={isCatalogLoading}
          campusId={campusId}
          campusOptions={campuses.map((campus) => [campus.id, campus.code])}
          onCampusChange={setCampusId}
          search={branchSearch}
          onSearchChange={setBranchSearch}
          columns={[
            { header: "Campus" },
            { header: "Department" },
            { header: "Code" },
            { header: "Branch" }
          ]}
          rows={branches.map((branch) => ({
            id: branch.id,
            cells: [
              branch.campus?.code ?? "-",
              formatOptionLabel(branch.department.code, branch.department.name),
              branch.code,
              branch.name
            ]
          }))}
        />
      </div>
    </WorkflowExistingRecordsPageShell>
  );
}

export function AddDepartmentPage() {
  const { campuses, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ campusId: "", name: "", code: "", durationYears: "", branches: [emptyBranch()] });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durationYears = Number(form.durationYears);
    if (!form.campusId) {
      showToast("Select a campus first.", "error");
      return;
    }
    if (!form.name.trim() || !form.code.trim()) {
      showToast("Enter department name and code.", "error");
      return;
    }
    if (!Number.isInteger(durationYears) || durationYears < 1) {
      showToast("Enter valid duration years.", "error");
      return;
    }
    if (!hasValidBranches(form.branches)) {
      showToast("Enter at least one branch name and branch code.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await sendJson("/api/departments", { ...form, durationYears });
      showToast("Department created successfully");
      navigate("/department-branch");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create department", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FocusedShell title="Add Department">
      <form className="db-card db-form" noValidate onSubmit={(event) => void submit(event)}>
        <Field label="Select Campus">
          <Select value={form.campusId} onChange={(campusId) => setForm({ ...form, campusId })} options={campuses.map((campus) => [campus.id, campus.code])} placeholder="Select Campus" required searchable={false} />
        </Field>
        <Field label="Department Name">
          <Input value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="B.Tech" required />
        </Field>
        <Field label="Department Code">
          <Input value={form.code} onChange={(code) => setForm({ ...form, code })} placeholder="BTECH" required />
        </Field>
        <Field label="Duration Years">
          <Input type="number" min={1} value={form.durationYears} onChange={(durationYears) => setForm({ ...form, durationYears })} placeholder="Enter duration years" required />
        </Field>

        <BranchRows branches={form.branches} onChange={(branches) => setForm({ ...form, branches })} />
        <SubmitButton isSaving={isSaving}>Create Department</SubmitButton>
      </form>
    </FocusedShell>
  );
}

export function AddBranchPage() {
  const { campuses, departments, loadDepartments, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ campusId: "", departmentId: "", branches: [emptyBranch()] });

  useEffect(() => {
    if (form.campusId) void loadDepartments(form.campusId);
  }, [form.campusId, loadDepartments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.campusId) {
      showToast("Select a campus first.", "error");
      return;
    }
    if (!form.departmentId) {
      showToast("Select a department first.", "error");
      return;
    }
    if (!hasValidBranches(form.branches)) {
      showToast("Enter at least one branch name and branch code.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await sendJson("/api/branches", { departmentId: form.departmentId, branches: form.branches });
      showToast("Branch created successfully");
      navigate("/department-branch");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create branch", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FocusedShell title="Add Branch">
      <form className="db-card db-form" noValidate onSubmit={(event) => void submit(event)}>
        <CampusDepartmentSelect campuses={campuses} departments={departments} campusId={form.campusId} departmentId={form.departmentId} onCampus={(campusId) => setForm({ ...form, campusId, departmentId: "" })} onDepartment={(departmentId) => setForm({ ...form, departmentId })} />
        <BranchRows branches={form.branches} onChange={(branches) => setForm({ ...form, branches })} />
        <SubmitButton isSaving={isSaving}>Create Branches</SubmitButton>
      </form>
    </FocusedShell>
  );
}

export function ModifyDepartmentPage() {
  const { campuses, departments, loadDepartments, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [selection, setSelection] = useState({ campusId: "", departmentId: "" });
  const selectedDepartment = useMemo(() => departments.find((item) => item.id === selection.departmentId), [departments, selection.departmentId]);
  const [form, setForm] = useState({ name: "", code: "", durationYears: 4, branches: [] as BranchRow[] });

  useEffect(() => {
    if (selection.campusId) void loadDepartments(selection.campusId);
  }, [selection.campusId, loadDepartments]);
  useEffect(() => {
    if (selectedDepartment) {
      setForm({ name: selectedDepartment.name, code: selectedDepartment.code, durationYears: selectedDepartment.durationYears, branches: selectedDepartment.branches.length ? selectedDepartment.branches : [emptyBranch()] });
    }
  }, [selectedDepartment]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection.departmentId) return;
    setIsSaving(true);
    try {
      await sendJson(`/api/departments/${selection.departmentId}`, form, "PATCH");
      showToast("Department updated successfully");
      await loadDepartments(selection.campusId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update department", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FocusedShell title="Modify Department">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <CampusDepartmentSelect
          campuses={campuses}
          departments={departments}
          campusId={selection.campusId}
          departmentId={selection.departmentId}
          departmentInputMode={false}
          departmentLabel="Select Department"
          departmentPlaceholder="Select Department"
          departmentSearchable={false}
          onCampus={(campusId) => setSelection({ campusId, departmentId: "" })}
          onDepartment={(departmentId) => setSelection({ ...selection, departmentId })}
        />
        {selectedDepartment ? (
          <>
            <Field label="Department Name"><Input value={form.name} onChange={(name) => setForm({ ...form, name })} required /></Field>
            <Field label="Department Code"><Input value={form.code} onChange={(code) => setForm({ ...form, code })} required /></Field>
            <Field label="Duration Years"><Input type="number" min={1} value={String(form.durationYears)} onChange={(value) => setForm({ ...form, durationYears: Number(value) })} required /></Field>
            <BranchRows branches={form.branches} onChange={(branches) => setForm({ ...form, branches })} />
            <SubmitButton isSaving={isSaving}>Update Department</SubmitButton>
          </>
        ) : <EmptyState>Select a department to modify.</EmptyState>}
      </form>
    </FocusedShell>
  );
}

export function ModifyBranchPage() {
  const { campuses, branches, loadBranches, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [selection, setSelection] = useState({ campusId: "", branchId: "" });
  const selectedBranch = branches.find((item) => item.id === selection.branchId);
  const [form, setForm] = useState({ name: "", code: "" });

  useEffect(() => {
    if (selection.campusId) void loadBranches(selection.campusId);
  }, [selection.campusId, loadBranches]);
  useEffect(() => {
    if (selectedBranch) setForm({ name: selectedBranch.name, code: selectedBranch.code });
  }, [selectedBranch]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await sendJson(`/api/branches/${selection.branchId}`, form, "PATCH");
      showToast("Branch updated successfully");
      await loadBranches(selection.campusId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update branch", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FocusedShell title="Modify Branch">
      <form className="db-card db-form" onSubmit={(event) => void submit(event)}>
        <CampusBranchSelect
          campuses={campuses}
          branches={branches}
          campusId={selection.campusId}
          branchId={selection.branchId}
          branchInputMode={false}
          branchLabel="Select Branch"
          branchPlaceholder="Select Branch"
          branchSearchable={false}
          onCampus={(campusId) => setSelection({ campusId, branchId: "" })}
          onBranch={(branchId) => setSelection({ ...selection, branchId })}
        />
        {selectedBranch ? (
          <>
            <Field label="Branch Name"><Input value={form.name} onChange={(name) => setForm({ ...form, name })} required /></Field>
            <Field label="Branch Code"><Input value={form.code} onChange={(code) => setForm({ ...form, code })} required /></Field>
            <SubmitButton isSaving={isSaving}>Update Branch</SubmitButton>
          </>
        ) : <EmptyState>Select a branch to modify.</EmptyState>}
      </form>
    </FocusedShell>
  );
}

export function DeleteDepartmentPage() {
  const { campuses, departments, loadDepartments, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selection, setSelection] = useState({ campusId: "", departmentId: "" });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const selectedDepartment = departments.find((item) => item.id === selection.departmentId);

  useEffect(() => {
    if (selection.campusId) void loadDepartments(selection.campusId);
  }, [selection.campusId, loadDepartments]);

  async function archive() {
    if (!selectedDepartment) return;
    try {
      await sendJson(`/api/departments/${selectedDepartment.id}`, {}, "DELETE");
      setIsConfirmOpen(false);
      showToast("Department archived successfully", "danger");
      navigate("/department-branch");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive department", "error");
    }
  }

  return (
    <FocusedShell title="Delete Department">
      <div className="db-card db-form">
        <CampusDepartmentSelect
          campuses={campuses}
          departments={departments}
          campusId={selection.campusId}
          departmentId={selection.departmentId}
          departmentInputMode={false}
          departmentLabel="Select Department"
          departmentPlaceholder="Select Department"
          departmentSearchable={false}
          onCampus={(campusId) => setSelection({ campusId, departmentId: "" })}
          onDepartment={(departmentId) => setSelection({ ...selection, departmentId })}
        />
        {selectedDepartment ? <ArchiveSummary title={selectedDepartment.name} code={selectedDepartment.code} onArchive={() => setIsConfirmOpen(true)} /> : <EmptyState>Select a department to archive.</EmptyState>}
      </div>
      <ConfirmArchiveDialog
        isOpen={isConfirmOpen}
        title="Archive department?"
        message="This will archive the department and all child branches."
        itemName={selectedDepartment?.name}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={archive}
      />
    </FocusedShell>
  );
}

export function DeleteBranchPage() {
  const { campuses, branches, loadBranches, sendJson } = useDepartmentBranchData();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selection, setSelection] = useState({ campusId: "", branchId: "" });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const selectedBranch = branches.find((item) => item.id === selection.branchId);

  useEffect(() => {
    if (selection.campusId) void loadBranches(selection.campusId);
  }, [selection.campusId, loadBranches]);

  async function archive() {
    if (!selectedBranch) return;
    try {
      await sendJson(`/api/branches/${selectedBranch.id}`, {}, "DELETE");
      setIsConfirmOpen(false);
      showToast("Branch archived successfully", "danger");
      navigate("/department-branch");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive branch", "error");
    }
  }

  return (
    <FocusedShell title="Delete Branch">
      <div className="db-card db-form">
        <CampusBranchSelect
          campuses={campuses}
          branches={branches}
          campusId={selection.campusId}
          branchId={selection.branchId}
          branchInputMode={false}
          branchLabel="Select Branch"
          branchPlaceholder="Select Branch"
          branchSearchable={false}
          onCampus={(campusId) => setSelection({ campusId, branchId: "" })}
          onBranch={(branchId) => setSelection({ ...selection, branchId })}
        />
        {selectedBranch ? <ArchiveSummary title={selectedBranch.name} code={selectedBranch.code} onArchive={() => setIsConfirmOpen(true)} /> : <EmptyState>Select a branch to archive.</EmptyState>}
      </div>
      <ConfirmArchiveDialog
        isOpen={isConfirmOpen}
        title="Archive branch?"
        message="This branch will be archived and hidden from active lists."
        itemName={selectedBranch?.name}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={archive}
      />
    </FocusedShell>
  );
}

function FocusedShell({ children, title, variant = "subpage" }: { children: ReactNode; title: string; variant?: "main" | "subpage" }) {
  const navigate = useNavigate();

  return (
    <main className="db-workflow min-h-screen">
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
          <ProfileMenuButton />
        </div>
      </header>
      <section className="db-workflow-body">{children}</section>
    </main>
  );
}

function useDepartmentBranchData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departmentTotal, setDepartmentTotal] = useState(0);
  const [branchTotal, setBranchTotal] = useState(0);
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

  const loadCampuses = useCallback(async () => {
    const page = await fetchJson<PageResponse<Campus>>("/api/campuses?pageSize=100");
    setCampuses(page.items);
  }, [fetchJson]);

  const loadDepartments = useCallback(async (campusId?: string, search?: string) => {
    const params = new URLSearchParams({ pageSize: "100" });
    appendOwnedCampusFilter(params, campusId);
    if (search?.trim()) params.set("search", search.trim());
    const page = await fetchJson<PageResponse<Department>>(`/api/departments?${params.toString()}`);
    setDepartments(page.items);
    setDepartmentTotal(page.total);
    return page.items;
  }, [fetchJson]);

  const loadBranches = useCallback(async (campusId?: string, search?: string) => {
    const params = new URLSearchParams({ pageSize: "100" });
    appendOwnedCampusFilter(params, campusId);
    if (search?.trim()) params.set("search", search.trim());
    const page = await fetchJson<PageResponse<Branch>>(`/api/branches?${params.toString()}`);
    setBranches(page.items);
    setBranchTotal(page.total);
    return page.items;
  }, [fetchJson]);

  const loadCatalog = useCallback(async (filters: { campusId?: string; departmentSearch?: string; branchSearch?: string }) => {
    setIsCatalogLoading(true);
    try {
      await Promise.all([
        loadDepartments(filters.campusId, filters.departmentSearch),
        loadBranches(filters.campusId, filters.branchSearch)
      ]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load existing records", "error");
    } finally {
      setIsCatalogLoading(false);
    }
  }, [loadBranches, loadDepartments, showToast]);

  useEffect(() => {
    void loadCampuses().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load campuses", "error"));
  }, [loadCampuses, showToast]);

  return {
    campuses,
    departments,
    branches,
    departmentTotal,
    branchTotal,
    isCatalogLoading,
    fetchJson,
    sendJson,
    loadDepartments,
    loadBranches,
    loadCatalog
  };
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Input({ onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) {
  return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />;
}

function Select({ inputMode = false, options, onChange, placeholder, required, searchable = true, value }: { options: [string, string][]; onChange: (value: string) => void; inputMode?: boolean; placeholder?: string; required?: boolean; searchable?: boolean; value: string }) {
  return (
    <SearchableSelect value={String(value ?? "")} onChange={onChange} options={options} placeholder={placeholder} required={required} searchable={searchable} inputMode={inputMode} />
  );
}

function CampusDepartmentSelect({
  campuses,
  departmentInputMode = true,
  departmentLabel = "Search Department",
  departmentPlaceholder = "Search Department",
  departmentSearchable = true,
  departments,
  campusId,
  departmentId,
  onCampus,
  onDepartment
}: {
  campuses: Campus[];
  departmentInputMode?: boolean;
  departmentLabel?: string;
  departmentPlaceholder?: string;
  departmentSearchable?: boolean;
  departments: Department[];
  campusId: string;
  departmentId: string;
  onCampus: (value: string) => void;
  onDepartment: (value: string) => void;
}) {
  return (
    <>
      <Field label="Select Campus"><Select value={campusId} onChange={onCampus} options={campuses.map((campus) => [campus.id, campus.code])} placeholder="Select Campus" required searchable={false} /></Field>
      <Field label={departmentLabel}>
        <Select
          value={departmentId}
          onChange={onDepartment}
          options={departments.map((department) => [department.id, formatOptionLabel(department.code, department.name)])}
          required
          inputMode={departmentInputMode}
          placeholder={departmentPlaceholder}
          searchable={departmentSearchable}
        />
      </Field>
    </>
  );
}

function CampusBranchSelect({
  campuses,
  branchInputMode = true,
  branchLabel = "Search Branch",
  branchPlaceholder = "Search Branch",
  branchSearchable = true,
  branches,
  campusId,
  branchId,
  onCampus,
  onBranch
}: {
  campuses: Campus[];
  branchInputMode?: boolean;
  branchLabel?: string;
  branchPlaceholder?: string;
  branchSearchable?: boolean;
  branches: Branch[];
  campusId: string;
  branchId: string;
  onCampus: (value: string) => void;
  onBranch: (value: string) => void;
}) {
  return (
    <>
      <Field label="Select Campus"><Select value={campusId} onChange={onCampus} options={campuses.map((campus) => [campus.id, campus.code])} placeholder="Select Campus" required searchable={false} /></Field>
      <Field label={branchLabel}>
        <Select
          value={branchId}
          onChange={onBranch}
          options={branches.map((branch) => [branch.id, formatOptionLabel(branch.code, branch.name)])}
          required
          inputMode={branchInputMode}
          placeholder={branchPlaceholder}
          searchable={branchSearchable}
        />
      </Field>
    </>
  );
}

function BranchRows({ branches, onChange }: { branches: BranchRow[]; onChange: (branches: BranchRow[]) => void }) {
  function update(index: number, key: "name" | "code", value: string) {
    onChange(branches.map((branch, branchIndex) => branchIndex === index ? { ...branch, [key]: value } : branch));
  }

  return (
    <section className="db-branch-rows">
      <div className="db-branch-header">
        <h2>Dynamic Branch Section</h2>
        <button type="button" onClick={() => onChange([...branches, emptyBranch()])}><Plus size={16} /> Add Branch</button>
      </div>
      {branches.map((branch, index) => (
        <div className="db-branch-row" key={branch.id ?? index}>
          <Field label="Branch Name"><Input value={branch.name} onChange={(value) => update(index, "name", value)} placeholder="Artificial Intelligence" /></Field>
          <Field label="Branch Code"><Input value={branch.code} onChange={(value) => update(index, "code", value)} placeholder="AI" /></Field>
          {branches.length > 1 ? <button type="button" className="db-row-remove" onClick={() => onChange(branches.filter((_, branchIndex) => branchIndex !== index))}>Remove</button> : null}
        </div>
      ))}
    </section>
  );
}

function SubmitButton({ children, isSaving }: { children: ReactNode; isSaving: boolean }) {
  return <button className="db-submit" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : children}</button>;
}

function ArchiveSummary({ code, onArchive, title }: { title: string; code: string; onArchive: () => void | Promise<void> }) {
  return (
    <div className="db-archive-summary">
      <div>
        <p>{title}</p>
        <span>{code}</span>
      </div>
      <button type="button" onClick={() => void onArchive()}><Trash2 size={18} /> Archive</button>
    </div>
  );
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
      <section className="erp-confirm-card" aria-modal="true" role="dialog" aria-labelledby="archive-dialog-title">
        <div className="erp-confirm-icon">
          <Trash2 size={24} />
        </div>
        <h2 id="archive-dialog-title">{title}</h2>
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

function hasValidBranches(branches: BranchRow[]) {
  return branches.some((branch) => branch.name.trim() && branch.code.trim());
}

function formatOptionLabel(code: string, name: string) {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase() === name.replace(/[^A-Z0-9]/gi, "").toUpperCase()
    ? name
    : `${code} - ${name}`;
}

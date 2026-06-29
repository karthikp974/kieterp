import { Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section, Subject } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { formatIstLocaleDateTime } from "../shared/ist-time";

type TeacherRole = "HTPO" | "CTPO" | "STPO";
type TeacherStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type AssignmentDraft = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  role: TeacherRole;
  sectionId?: string;
  subjectId?: string;
};
type TeacherListItem = {
  id: string;
  identity: {
    fullName: string;
    employeeCode: string;
    email: string;
    phone?: string | null;
    designation?: string | null;
    joinedOn?: string | null;
    status: TeacherStatus;
  };
  summary: { assignments: number; campuses: string[]; roles: Record<string, number> };
};
type TeacherDetailResponse = { teacher: TeacherListItem & { assignments: AssignmentDraft[] } };
type AuditLogItem = { id: string; action: string; entity: string; entityId?: string | null; createdAt: string };

const inputClass = "db-input";

export function TeacherManagement() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [step, setStep] = useState(1);
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<TeacherStatus>("ACTIVE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherListItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [identity, setIdentity] = useState({
    fullName: "",
    employeeCode: "",
    email: "",
    phone: "",
    designation: "",
    joinedOn: "",
    password: "Teacher@123"
  });
  const [assignment, setAssignment] = useState<AssignmentDraft>({
    campusId: "",
    programId: "",
    branchId: "",
    batchId: "",
    classId: "",
    role: "HTPO"
  });
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown, method = "POST") {
    const response = await authFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Teacher action failed.");
    }
    return (await response.json()) as T;
  }

  async function loadData() {
    const params = new URLSearchParams({ pageSize: "25", page: String(page), status: statusFilter });
    if (search.trim()) params.set("search", search.trim());
    const [teacherPage, campusPage, programPage, branchPage, batchPage, classPage, sectionPage, subjectPage, auditPage] = await Promise.all([
      fetchJson<PaginatedResponse<TeacherListItem>>(`/api/teachers?${params.toString()}`),
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100"),
      fetchJson<PaginatedResponse<Subject>>("/api/core/subjects?pageSize=100"),
      fetchJson<PaginatedResponse<AuditLogItem>>("/api/audit-logs?entity=TeacherProfile&pageSize=6")
    ]);
    setTeachers(teacherPage.items);
    setTotal(teacherPage.total);
    setCampuses(campusPage.items);
    setPrograms(programPage.items);
    setBranches(branchPage.items);
    setBatches(batchPage.items);
    setClasses(classPage.items);
    setSections(sectionPage.items);
    setSubjects(subjectPage.items);
    setAuditLogs(auditPage.items);

    setAssignment((current) => ({
      ...current,
      campusId: current.campusId || campusPage.items[0]?.id || "",
      programId: current.programId || programPage.items[0]?.id || "",
      branchId: current.branchId || branchPage.items[0]?.id || "",
      batchId: current.batchId || batchPage.items[0]?.id || "",
      classId: current.classId || classPage.items[0]?.id || ""
    }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load teachers", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  const filteredPrograms = programsForOperationalCampus(programs, assignment.campusId, campuses);
  const filteredBranches = branches.filter((branch) => branch.programId === assignment.programId);
  const filteredBatches = batches.filter((batch) => batch.branchId === assignment.branchId);
  const filteredClasses = classes.filter((item) => item.batchId === assignment.batchId);
  const filteredSections = sections.filter((section) => section.classId === assignment.classId);
  const selectedClass = classes.find((item) => item.id === assignment.classId);
  const filteredSubjects = subjects.filter(
    (subject) => subject.branchId === assignment.branchId && subject.semesterNumber === selectedClass?.semesterNumber
  );

  const canAddAssignment = useMemo(() => {
    if (!assignment.campusId || !assignment.programId || !assignment.branchId || !assignment.batchId || !assignment.classId) return false;
    if ((assignment.role === "CTPO" || assignment.role === "STPO") && !assignment.sectionId) return false;
    if (assignment.role === "STPO" && !assignment.subjectId) return false;
    return true;
  }, [assignment]);

  function addAssignment() {
    if (!canAddAssignment) {
      showToast("Complete required assignment fields", "error");
      return;
    }
    const key = JSON.stringify(assignment);
    if (assignments.some((item) => JSON.stringify(item) === key)) {
      showToast("Duplicate assignment", "error");
      return;
    }
    setAssignments([...assignments, assignment]);
    showToast("Assignment added");
  }

  async function saveTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingTeacherId) {
      if (!assignments.length) {
        showToast("Teacher must have at least one assignment", "error");
        return;
      }
      await postJson(`/api/teachers/${editingTeacherId}`, {
        fullName: identity.fullName,
        email: identity.email,
        phone: identity.phone || undefined,
        designation: identity.designation || undefined,
        joinedOn: identity.joinedOn || undefined
      }, "PATCH");
      await postJson(`/api/teachers/${editingTeacherId}/assignments`, { assignments }, "PATCH");
      resetTeacherForm();
      await loadData();
      showToast("Teacher updated");
      return;
    }

    if (!assignments.length) {
      showToast("Add at least one assignment", "error");
      return;
    }
    await postJson("/api/teachers/validate", { identity, assignments });
    await postJson("/api/teachers", { identity, assignments });
    resetTeacherForm();
    await loadData();
    showToast("Teacher created");
  }

  function resetTeacherForm() {
    setEditingTeacherId(null);
    setIdentity({ fullName: "", employeeCode: "", email: "", phone: "", designation: "", joinedOn: "", password: "Teacher@123" });
    setAssignments([]);
    setStep(1);
  }

  async function deactivateTeacher(id: string) {
    const teacher = teachers.find((row) => row.id === id);
    const ok = await confirm({
      title: "Deactivate teacher?",
      message: "Their login sessions and active role assignments will be turned off.",
      itemName: teacher?.identity.fullName,
      confirmLabel: "Deactivate",
      icon: Trash2
    });
    if (!ok) return;

    await postJson(`/api/teachers/${id}/deactivate`, {});
    await loadData();
    showToast("Teacher deactivated");
  }

  async function reactivateTeacher(id: string) {
    await postJson(`/api/teachers/${id}/reactivate`, {});
    await loadData();
    showToast("Teacher reactivated");
  }

  async function resetPassword(id: string) {
    const password = window.prompt("Enter new temporary password");
    if (!password) return;
    await postJson(`/api/teachers/${id}/reset-password`, { password });
    showToast("Teacher password reset");
  }

  async function bulkImportTeachers() {
    const parsed = JSON.parse(bulkText) as unknown;
    const teachers = Array.isArray(parsed) ? parsed : (parsed as { teachers?: unknown }).teachers;
    if (!Array.isArray(teachers)) throw new Error("Paste a JSON array of teachers or { teachers: [...] }.");
    const result = await postJson<{ created: number; errors: { employeeCode: string; message: string }[] }>("/api/teachers/bulk", { teachers });
    await loadData();
    showToast(`Imported ${result.created} teacher(s), ${result.errors.length} failed`, result.errors.length ? "error" : "success");
  }

  async function editTeacher(teacher: TeacherListItem) {
    const detail = await fetchJson<TeacherDetailResponse>(`/api/teachers/${teacher.id}`);
    setEditingTeacherId(teacher.id);
    setStep(1);
    setIdentity({
      fullName: teacher.identity.fullName,
      employeeCode: teacher.identity.employeeCode,
      email: teacher.identity.email,
      phone: teacher.identity.phone ?? "",
      designation: teacher.identity.designation ?? "",
      joinedOn: teacher.identity.joinedOn ?? "",
      password: ""
    });
    setAssignments(detail.teacher.assignments);
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Teacher Management</h2>
          <p className="mt-1 text-sm text-slate-500">Create teachers with HTPO, CTPO, and STPO assignments in one review flow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={inputClass} placeholder="Search teachers" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white" onClick={() => { setPage(1); void loadData(); }}>Search</button>
          <SearchableSelect value={statusFilter} options={[["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["SUSPENDED", "Suspended"]]} onChange={(status) => { setPage(1); setStatusFilter(status as TeacherStatus); }} />
          {[1, 2, 3].map((item) => (
            <button key={item} type="button" onClick={() => setStep(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${step === item ? "erp-admin-tab-active" : "erp-admin-tab-idle"}`}>
              Step {item}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={(event) => void saveTeacher(event)} className="space-y-5">
        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-3">
            <input className={inputClass} placeholder="Full name" value={identity.fullName} onChange={(event) => setIdentity({ ...identity, fullName: event.target.value })} required />
            <input className={inputClass} placeholder="Employee code" value={identity.employeeCode} onChange={(event) => setIdentity({ ...identity, employeeCode: event.target.value })} required disabled={Boolean(editingTeacherId)} />
            <input className={inputClass} placeholder="Email" type="email" value={identity.email} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} required />
            <input className={inputClass} placeholder="Phone" value={identity.phone} onChange={(event) => setIdentity({ ...identity, phone: event.target.value })} />
            <input className={inputClass} placeholder="Designation" value={identity.designation} onChange={(event) => setIdentity({ ...identity, designation: event.target.value })} />
            <input className={inputClass} type="date" value={identity.joinedOn} onChange={(event) => setIdentity({ ...identity, joinedOn: event.target.value })} />
            {!editingTeacherId ? <input className={inputClass} placeholder="Temporary password" value={identity.password} onChange={(event) => setIdentity({ ...identity, password: event.target.value })} required /> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Select value={assignment.campusId} items={campuses.map((x) => [x.id, x.code])} onChange={(campusId) => setAssignment({ ...assignment, campusId })} />
              <Select value={assignment.programId} items={filteredPrograms.map((x) => [x.id, x.code])} onChange={(programId) => setAssignment({ ...assignment, programId })} />
              <Select value={assignment.branchId} items={filteredBranches.map((x) => [x.id, x.code])} onChange={(branchId) => setAssignment({ ...assignment, branchId })} />
              <Select value={assignment.batchId} items={filteredBatches.map((x) => [x.id, `${x.startYear}-${x.endYear}`])} onChange={(batchId) => setAssignment({ ...assignment, batchId })} />
              <Select value={assignment.classId} items={filteredClasses.map((x) => [x.id, `Sem ${x.semesterNumber}`])} onChange={(classId) => setAssignment({ ...assignment, classId })} />
              <Select value={assignment.role} items={[["HTPO", "HTPO"], ["CTPO", "CTPO"], ["STPO", "STPO"]]} onChange={(role) => setAssignment({ ...assignment, role: role as TeacherRole, sectionId: undefined, subjectId: undefined })} />
              {assignment.role !== "HTPO" ? <Select value={assignment.sectionId ?? ""} items={filteredSections.map((x) => [x.id, x.name])} onChange={(sectionId) => setAssignment({ ...assignment, sectionId })} /> : null}
              {assignment.role === "STPO" ? <Select value={assignment.subjectId ?? ""} items={filteredSubjects.map((x) => [x.id, `${x.code} - ${x.name}`])} onChange={(subjectId) => setAssignment({ ...assignment, subjectId })} /> : null}
            </div>
            <SafeActionButton run={addAssignment}>Add Assignment</SafeActionButton>
            <AssignmentList assignments={assignments} remove={(index) => setAssignments(assignments.filter((_, itemIndex) => itemIndex !== index))} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-700">Review</p>
            <p className="text-sm text-slate-600">{identity.fullName || "Teacher name"} / {identity.employeeCode || "Employee code"} / {assignments.length} assignment(s)</p>
            <AssignmentList assignments={assignments} remove={(index) => setAssignments(assignments.filter((_, itemIndex) => itemIndex !== index))} />
            <div className="flex gap-2">
              <button className="erp-panel-submit">{editingTeacherId ? "Update Teacher" : "Save Teacher"}</button>
              {editingTeacherId ? <button type="button" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700" onClick={resetTeacherForm}>Cancel Edit</button> : null}
            </div>
          </div>
        ) : null}
      </form>

      <div className="mt-5 rounded-xl border bg-slate-50 p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700">Bulk Import Teachers</h3>
        <textarea className={`${inputClass} min-h-24`} placeholder='Paste JSON array: [{"identity":{"fullName":"Teacher","employeeCode":"T001","email":"t@example.com","password":"Teacher@123"},"assignments":[...]}]' value={bulkText} onChange={(event) => setBulkText(event.target.value)} />
        <SafeActionButton run={bulkImportTeachers} busyLabel="Importing...">Import Teachers</SafeActionButton>
      </div>

      <div className="mt-6 rounded-xl border">
        <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Teachers</div>
        {teachers.length ? teachers.map((teacher) => (
          <div key={teacher.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-700 md:grid-cols-8">
            <span>{teacher.identity.employeeCode}</span>
            <span>{teacher.identity.fullName}</span>
            <span>{teacher.identity.email}</span>
            <span>{teacher.summary.assignments} assignments</span>
            <button type="button" className="text-left font-semibold text-slate-700" onClick={() => setSelectedTeacher(teacher)}>Details</button>
            <button type="button" className="text-left font-semibold text-blue-700" onClick={() => void editTeacher(teacher)}>Edit</button>
            <button type="button" className="text-left font-semibold text-violet-700" onClick={() => void resetPassword(teacher.id)}>Password</button>
            {teacher.identity.status === "ACTIVE" ? (
              <button type="button" className="text-left font-semibold text-amber-700" onClick={() => void deactivateTeacher(teacher.id)}>
                Deactivate
              </button>
            ) : (
              <button type="button" className="text-left font-semibold text-green-700" onClick={() => void reactivateTeacher(teacher.id)}>Reactivate</button>
            )}
          </div>
        )) : <p className="px-4 py-6 text-sm text-slate-500">No teachers yet.</p>}
      </div>

      <Pager page={page} pageSize={25} total={total} onPage={setPage} />

      <div className="mt-5 rounded-xl border">
        <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Recent Teacher Audit</div>
        {auditLogs.length ? auditLogs.map((log) => (
          <div key={log.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-600 md:grid-cols-3">
            <span>{log.action}</span>
            <span>{log.entityId ?? "-"}</span>
            <span>{formatIstLocaleDateTime(log.createdAt)}</span>
          </div>
        )) : <p className="px-4 py-6 text-sm text-slate-500">No audit records yet.</p>}
      </div>

      {selectedTeacher ? (
        <DetailModal title="Teacher Details" onClose={() => setSelectedTeacher(null)}>
          <p><strong>Name:</strong> {selectedTeacher.identity.fullName}</p>
          <p><strong>Employee Code:</strong> {selectedTeacher.identity.employeeCode}</p>
          <p><strong>Email:</strong> {selectedTeacher.identity.email}</p>
          <p><strong>Phone:</strong> {selectedTeacher.identity.phone ?? "-"}</p>
          <p><strong>Designation:</strong> {selectedTeacher.identity.designation ?? "-"}</p>
          <p><strong>Assignments:</strong> {selectedTeacher.summary.assignments}</p>
        </DetailModal>
      ) : null}
      {dialog}
    </section>
  );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm">
      <span>Page {page} of {maxPage} / {total} records</span>
      <div className="flex gap-2">
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function DetailModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-2 text-sm text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function Select({ value, items, onChange }: { value: string; items: string[][]; onChange: (value: string) => void }) {
  return (
    <SearchableSelect value={value} options={items.map(([id, label]) => [id, label])} onChange={onChange} required />
  );
}

function AssignmentList({ assignments, remove }: { assignments: AssignmentDraft[]; remove: (index: number) => void }) {
  return (
    <div className="space-y-2">
      {assignments.map((item, index) => (
        <div key={`${item.role}-${index}`} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
          <span>{item.role} / class {item.classId.slice(-4)} {item.sectionId ? `/ section ${item.sectionId.slice(-4)}` : ""}</span>
          <button type="button" className="text-red-600" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

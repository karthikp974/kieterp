import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { SafeActionButton } from "../../shared/SafeActionButton";
import { SearchableSelect } from "../../shared/SearchableSelect";
import { useConfirm } from "../../shared/ConfirmDialog";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

const PAGE_SIZE = 25;
const inputClass = "db-input";

type StudentStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type SetupSection = { id: string; label: string; campusId: string };
type TeacherStudent = {
  id: string;
  identity: { fullName: string; email?: string | null; phone?: string | null; fatherName?: string | null; rollNumber: string; status: StudentStatus };
  structure: { section: { id: string; name: string }; class: { semesterNumber: number; label: string }; branch: { code: string } };
};

function normalizeRoll(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function TeacherPortalStudentsInner() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();

  const [sections, setSections] = useState<SetupSection[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [statusFilter, setStatusFilter] = useState<StudentStatus>("ACTIVE");
  const [sectionFilter, setSectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [bulkText, setBulkText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ rollNumber: "", fullName: "", fatherName: "", email: "", phone: "", password: "", sectionId: "" });

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await authFetch(path);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? `Request failed: ${path}`);
    }
    return (await res.json()) as T;
  }

  async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await authFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const msg = Array.isArray(payload?.message) ? payload?.message.join(", ") : payload?.message;
      throw new Error(msg ?? "Student action failed.");
    }
    return (await res.json().catch(() => ({}))) as T;
  }

  const loadSetup = useCallback(async () => {
    const setup = await fetchJson<{ sections: SetupSection[] }>("/api/portals/teacher/students/setup");
    setSections(setup.sections);
    setForm((current) => ({ ...current, sectionId: current.sectionId || setup.sections[0]?.id || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStudents = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status: statusFilter });
    if (search.trim()) params.set("search", search.trim());
    if (sectionFilter) params.set("sectionId", sectionFilter);
    const data = await fetchJson<{ items: TeacherStudent[]; total: number }>(`/api/portals/teacher/students/manage?${params.toString()}`);
    setStudents(data.items);
    setTotal(data.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, sectionFilter, search]);

  useEffect(() => {
    void loadSetup().catch((e) => showToast(e instanceof Error ? e.message : "Could not load sections.", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadStudents().catch((e) => showToast(e instanceof Error ? e.message : "Could not load students.", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, sectionFilter]);

  const sectionOptions = useMemo(() => sections.map((s) => [s.id, s.label] as [string, string]), [sections]);

  function resetForm() {
    setEditingId(null);
    setForm((current) => ({ ...current, rollNumber: "", fullName: "", fatherName: "", email: "", phone: "", password: "" }));
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.sectionId) {
      showToast("Pick a section.", "error");
      return;
    }
    const campusId = sections.find((s) => s.id === form.sectionId)?.campusId;
    if (editingId) {
      await sendJson(`/api/portals/teacher/students/manage/${editingId}`, "PATCH", {
        fullName: form.fullName,
        fatherName: form.fatherName.trim() || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        sectionId: form.sectionId
      });
      showToast("Student updated");
    } else {
      if (!form.fatherName.trim()) {
        showToast("Father name is required.", "error");
        return;
      }
      await sendJson("/api/portals/teacher/students/manage", "POST", {
        rollNumber: form.rollNumber,
        fullName: form.fullName,
        fatherName: form.fatherName.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        password: form.password.trim() || normalizeRoll(form.rollNumber),
        sectionId: form.sectionId,
        campusId
      });
      showToast("Student created");
    }
    resetForm();
    await loadStudents();
  }

  function editStudent(student: TeacherStudent) {
    setEditingId(student.id);
    setForm({
      rollNumber: student.identity.rollNumber,
      fullName: student.identity.fullName,
      fatherName: student.identity.fatherName ?? "",
      email: student.identity.email ?? "",
      phone: student.identity.phone ?? "",
      password: "",
      sectionId: student.structure.section.id
    });
  }

  async function deactivateStudent(student: TeacherStudent) {
    const ok = await confirm({
      title: "Deactivate student?",
      message: "Their login sessions will be revoked, but old records stay safe.",
      itemName: student.identity.fullName,
      confirmLabel: "Deactivate",
      icon: Trash2
    });
    if (!ok) return;
    await sendJson(`/api/portals/teacher/students/manage/${student.id}/deactivate`, "POST");
    showToast("Student deactivated");
    await loadStudents();
  }

  async function reactivateStudent(id: string) {
    await sendJson(`/api/portals/teacher/students/manage/${id}/reactivate`, "POST");
    showToast("Student reactivated");
    await loadStudents();
  }

  async function resetPassword(id: string) {
    const password = window.prompt("Enter new temporary password (min 8 characters)");
    if (!password) return;
    await sendJson(`/api/portals/teacher/students/manage/${id}/reset-password`, "POST", { password });
    showToast("Password reset");
  }

  async function bulkImport() {
    const parsed = JSON.parse(bulkText) as unknown;
    const rows = Array.isArray(parsed) ? parsed : (parsed as { students?: unknown }).students;
    if (!Array.isArray(rows)) throw new Error('Paste a JSON array or { "students": [...] }.');
    const { job } = await sendJson<{ job: { id: string } }>("/api/portals/teacher/students/manage/bulk", "POST", { students: rows });
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const { job: status } = await fetchJson<{ job: { status: string; created: number | null; errors: { rollNumber: string; message: string }[]; error: string | null } }>(
        `/api/portals/teacher/students/manage/imports/${job.id}`
      );
      if (status.status === "completed" || status.status === "failed") {
        await loadStudents();
        if (status.status === "failed") throw new Error(status.error ?? "Import failed.");
        const failed = status.errors?.length ?? 0;
        showToast(`Imported ${status.created ?? 0} student(s), ${failed} failed`, failed ? "error" : "success");
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    throw new Error("Import is taking longer than expected — check back shortly.");
  }

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <TeacherPortalModuleShell title="Students" subtitle="Manage students in your sections — create, edit, deactivate, reset passwords, and bulk import.">
      <TeacherPortalPanelWrap>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input className={inputClass} placeholder="Search roll or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white" onClick={() => { setPage(1); void loadStudents(); }}>Search</button>
          <SearchableSelect value={statusFilter} options={[["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["SUSPENDED", "Suspended"]]} onChange={(v) => { setPage(1); setStatusFilter(v as StudentStatus); }} />
          <SearchableSelect value={sectionFilter} options={[["", "All my sections"], ...sectionOptions]} onChange={(v) => { setPage(1); setSectionFilter(v); }} />
        </div>

        <form className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(e) => void saveStudent(e)}>
          <input className={inputClass} placeholder="Roll number" value={form.rollNumber} required disabled={Boolean(editingId)}
            onChange={(e) => setForm({ ...form, rollNumber: e.target.value, password: normalizeRoll(e.target.value) })} />
          <input className={inputClass} placeholder="Full name" value={form.fullName} required onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={inputClass} placeholder="Father name" value={form.fatherName} required={!editingId} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
          <input className={inputClass} placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputClass} placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {!editingId ? <input className={inputClass} placeholder="Initial password (same as roll)" value={form.password} readOnly /> : null}
          <SearchableSelect value={form.sectionId} options={sectionOptions} onChange={(sectionId) => setForm({ ...form, sectionId })} required />
          <button className="erp-panel-submit">{editingId ? "Update Student" : "Add Student"}</button>
          {editingId ? <button type="button" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700" onClick={resetForm}>Cancel</button> : null}
        </form>

        <div className="mt-4 rounded-xl border bg-slate-50 p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">Bulk import</h3>
          <textarea className={`${inputClass} min-h-24`} placeholder='[{"rollNumber":"24CS001","fullName":"Ravi","fatherName":"Ravi Sr","sectionId":"..."}]' value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <SafeActionButton run={bulkImport} busyLabel="Importing...">Import students</SafeActionButton>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Students ({total})</div>
          {students.length ? students.map((student) => (
            <div key={student.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-700 md:grid-cols-7">
              <span className="font-semibold">{student.identity.rollNumber}</span>
              <span>{student.identity.fullName}</span>
              <span>{student.structure.branch.code} · Sem {student.structure.class.semesterNumber} · {student.structure.section.name}</span>
              <span className={student.identity.status === "ACTIVE" ? "text-green-700" : "text-slate-400"}>{student.identity.status}</span>
              <button type="button" className="text-left font-semibold text-blue-700" onClick={() => editStudent(student)}>Edit</button>
              <button type="button" className="text-left font-semibold text-violet-700" onClick={() => void resetPassword(student.id)}>Password</button>
              {student.identity.status === "ACTIVE" ? (
                <button type="button" className="text-left font-semibold text-red-600" onClick={() => void deactivateStudent(student)}>Deactivate</button>
              ) : (
                <button type="button" className="text-left font-semibold text-green-700" onClick={() => void reactivateStudent(student.id)}>Reactivate</button>
              )}
            </div>
          )) : <p className="px-4 py-6 text-sm text-slate-500">No students found.</p>}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm">
          <span>Page {page} of {maxPage} · {total} records</span>
          <div className="flex gap-2">
            <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
        {dialog}
      </TeacherPortalPanelWrap>
    </TeacherPortalModuleShell>
  );
}

export function TeacherPortalStudentsPage() {
  return (
    <RequireTeacherModule moduleKey="students">
      <TeacherPortalStudentsInner />
    </RequireTeacherModule>
  );
}

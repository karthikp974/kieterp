import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { Field } from "../../shared/Field";
import { FormSelect } from "../../shared/FormSelect";
import { SafeActionButton } from "../../shared/SafeActionButton";
import { useConfirm } from "../../shared/ConfirmDialog";
import { useToast } from "../../shared/toast-context";
import { Trash2 } from "lucide-react";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { TpBadge, TpCard, TpCardHead } from "../teacher-portal-ui";

const PAGE_SIZE = 25;

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
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
    try {
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
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save student.", "error");
    }
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
    try {
      await sendJson(`/api/portals/teacher/students/manage/${id}/reset-password`, "POST", { password });
      showToast("Password reset");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not reset password.", "error");
    }
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

  return (
    <TeacherPortalModuleShell title="Students" subtitle={TEACHER_MODULE_SUBTITLES.students}>
      <TeacherPortalPanelWrap>
        <TpCard>
          <TpCardHead title={editingId ? "Edit student" : "Add student"} />
          <form className="tp-student-form" onSubmit={(e) => void saveStudent(e)}>
            <div className="tp-student-form-grid">
              <Field label="Roll number">
                <input className="db-input" placeholder="e.g. 24CS001" value={form.rollNumber} required disabled={Boolean(editingId)}
                  onChange={(e) => setForm({ ...form, rollNumber: e.target.value, password: normalizeRoll(e.target.value) })} />
              </Field>
              <Field label="Full name">
                <input className="db-input" placeholder="Student name" value={form.fullName} required onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <Field label="Father name">
                <input className="db-input" placeholder="Father name" value={form.fatherName} required={!editingId} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
              </Field>
              <Field label="Section">
                <FormSelect value={form.sectionId} options={sectionOptions} onChange={(sectionId) => setForm({ ...form, sectionId })} required aria-label="Section" />
              </Field>
              <Field label="Email (optional)">
                <input className="db-input" type="email" placeholder="name@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Phone (optional)">
                <input className="db-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              {!editingId ? (
                <Field label="Initial password" hint="Defaults to the roll number.">
                  <input className="db-input db-input-readonly" value={form.password} readOnly />
                </Field>
              ) : null}
            </div>
            <div className="db-form-actions">
              <button type="submit" className="erp-btn erp-btn--primary erp-btn--md">{editingId ? "Update student" : "Add student"}</button>
              {editingId ? <button type="button" className="erp-btn erp-btn--secondary erp-btn--md" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </TpCard>

        <TpCard>
          <TpCardHead title="Bulk import" />
          <textarea className="db-input tp-student-bulk" placeholder='[{"rollNumber":"24CS001","fullName":"Ravi","fatherName":"Ravi Sr","sectionId":"..."}]' value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <div className="db-form-actions">
            <SafeActionButton run={bulkImport} busyLabel="Importing…">Import students</SafeActionButton>
          </div>
        </TpCard>

        <TpCard>
          <TpCardHead
            title="Students"
            actions={<TpBadge variant="outline">{total} total</TpBadge>}
          />
          <div className="tp-student-toolbar">
            <input className="db-input" placeholder="Search roll or name" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void loadStudents(); } }} />
            <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => { setPage(1); void loadStudents(); }}>Search</button>
            <FormSelect value={statusFilter} options={[["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["SUSPENDED", "Suspended"]]} onChange={(v) => { setPage(1); setStatusFilter(v as StudentStatus); }} aria-label="Status filter" />
            <FormSelect value={sectionFilter} options={[["", "All my sections"], ...sectionOptions]} onChange={(v) => { setPage(1); setSectionFilter(v); }} aria-label="Section filter" />
          </div>

          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr><th>Roll</th><th>Name</th><th>Section</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {students.length ? students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.identity.rollNumber}</td>
                    <td>{student.identity.fullName}</td>
                    <td>{student.structure.branch.code} · Sem {student.structure.class.semesterNumber} · {student.structure.section.name}</td>
                    <td><TpBadge variant={student.identity.status === "ACTIVE" ? "solid" : "muted"}>{student.identity.status}</TpBadge></td>
                    <td>
                      <div className="db-inline-actions">
                        <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => editStudent(student)}>Edit</button>
                        <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => void resetPassword(student.id)}>Password</button>
                        {student.identity.status === "ACTIVE" ? (
                          <button type="button" className="erp-btn erp-btn--danger erp-btn--sm" onClick={() => void deactivateStudent(student)}>Deactivate</button>
                        ) : (
                          <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => void reactivateStudent(student.id)}>Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="tp-student-empty">No students found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE ? (
            <div className="tp-student-pager">
              <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {maxPage}</span>
              <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          ) : null}
        </TpCard>
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

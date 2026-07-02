import { ArrowLeft, History, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, InputHTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { SearchableSelect } from "../shared/SearchableSelect";
import { safeRandomId } from "../shared/safe-random-id";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";

type FeeTarget = "STUDENT" | "SECTION";
type FeeStudent = { id: string; fullName: string; rollNumber: string; email?: string | null; section: string; class: string; semester: number };
type FeeForm = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  yearNumber: string;
  classId: string;
  sectionId: string;
  targetType: FeeTarget;
  studentId: string;
  feeHead: string;
  feeAmount: string;
  remarks: string;
  deadline: string;
};

const emptyForm = (): FeeForm => ({
  campusId: "",
  programId: "",
  branchId: "",
  batchId: "",
  yearNumber: "",
  classId: "",
  sectionId: "",
  targetType: "SECTION",
  studentId: "",
  feeHead: "",
  feeAmount: "",
  remarks: "",
  deadline: ""
});

function HubActionButton({ children, description, icon, onClick }: { children: ReactNode; description: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <OptionActionButton description={description} icon={icon} onClick={onClick}>
      {children}
    </OptionActionButton>
  );
}

export function FeeStructureHomePage() {
  const navigate = useNavigate();
  return (
    <FeeShell title="Fee Structure" variant="main">
      <WorkflowSection title="Assign">
        <HubActionButton
          description="Select campus through section, then assign fees to a section or individual student."
          icon={WalletCards}
          onClick={() => navigate("/fee-structure/assign-fee")}
        >
          Assign fee
        </HubActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <HubActionButton
          description="View recent fee assignments and audit records."
          icon={History}
          onClick={() => navigate("/fee-structure/history")}
        >
          Fee structure history
        </HubActionButton>
      </WorkflowSection>
    </FeeShell>
  );
}

export function FeeStructureAssignPage() {
  const data = useFeeStructureData();
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [selectedStudent, setSelectedStudent] = useState<FeeStudent | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => safeRandomId("fee"));
  const options = useFeeOptions(data, form);
  const canShowFeeFields = form.sectionId && (form.targetType === "SECTION" || selectedStudent);
  const { loadFeeStudentsForSection, clearFeeStudents, studentsLoading, studentPoolTotal } = data;

  useEffect(() => {
    if (form.sectionId && form.targetType === "STUDENT") {
      void loadFeeStudentsForSection(form.sectionId).catch((error) =>
        showToast(error instanceof Error ? error.message : "Unable to load students for this section", "error")
      );
    } else {
      clearFeeStudents();
    }
  }, [form.sectionId, form.targetType, loadFeeStudentsForSection, clearFeeStudents, showToast]);

  const feeStudentSelectOptions = useMemo(
    () => data.students.map((student) => ({ value: student.id, label: student.fullName, description: `Roll ${student.rollNumber}` })),
    [data.students]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateFeeForm(form, selectedStudent);
    if (error) {
      showToast(error, "error");
      return;
    }
    setIsSaving(true);
    try {
      await data.assignFee({
        campusId: form.campusId,
        programId: form.programId,
        branchId: form.branchId,
        batchId: form.batchId || undefined,
        yearNumber: form.yearNumber ? Number(form.yearNumber) : undefined,
        classId: form.classId,
        sectionId: form.sectionId,
        targetType: form.targetType,
        studentId: form.targetType === "STUDENT" ? selectedStudent?.id : undefined,
        feeHead: form.feeHead,
        feeAmount: Number(form.feeAmount),
        remarks: form.remarks || undefined,
        deadline: form.deadline,
        idempotencyKey
      });
      showToast("Fee structure assigned successfully");
      setForm((current) => ({ ...current, feeHead: "", feeAmount: "", remarks: "", deadline: "", studentId: "" }));
      setSelectedStudent(null);
      setIdempotencyKey(safeRandomId("fee"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Fee assignment failed", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FeeShell title="Assign fee" variant="workflow" backHref="/fee-structure">
      <form className="db-card db-form fee-structure-form" onSubmit={(event) => void submit(event)}>
        <div className="fee-form-heading">
          <h2>Filter Selection</h2>
          <p>Select the academic scope. Each dropdown filters the next one.</p>
        </div>
        <div className="teacher-form-grid">
          <Field label="Campus"><PlainSelect value={form.campusId} options={data.campuses.map((item) => [item.id, item.code])} onChange={(campusId) => setForm({ ...form, campusId, programId: "", branchId: "", batchId: "", yearNumber: "", classId: "", sectionId: "", studentId: "" })} placeholder="Select campus" /></Field>
          <Field label="Department"><PlainSelect value={form.programId} options={options.programs.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(programId) => setForm({ ...form, programId, branchId: "", batchId: "", yearNumber: "", classId: "", sectionId: "", studentId: "" })} placeholder="Select department" /></Field>
          <Field label="Branch"><PlainSelect value={form.branchId} options={options.branches.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(branchId) => setForm({ ...form, branchId, batchId: "", yearNumber: "", classId: "", sectionId: "", studentId: "" })} placeholder="Select branch" /></Field>
          <Field label="Batch"><PlainSelect value={form.batchId} options={options.batches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => setForm({ ...form, batchId, yearNumber: "", classId: "", sectionId: "", studentId: "" })} placeholder="Select batch" /></Field>
          <Field label="Year"><PlainSelect value={form.yearNumber} options={options.years.map((y) => [String(y), `Year ${y}`])} onChange={(yearNumber) => setForm({ ...form, yearNumber, classId: "", sectionId: "", studentId: "" })} placeholder="Select year" /></Field>
          <Field label="Class"><PlainSelect value={form.classId} options={options.classes.map((item) => [item.id, item.label || `Semester ${item.semesterNumber}`])} onChange={(classId) => setForm({ ...form, classId, sectionId: "", studentId: "" })} placeholder="Select class" /></Field>
          <Field label="Section"><PlainSelect value={form.sectionId} options={options.sections.map((item) => [item.id, item.name])} onChange={(sectionId) => { setForm({ ...form, sectionId, studentId: "" }); setSelectedStudent(null); }} placeholder="Select section" /></Field>
        </div>

        {form.sectionId ? (
          <section className="fee-target-card">
            <div className="fee-form-heading">
              <h2>Target Selection</h2>
              <p>Assign this fee to a single student or the whole selected section.</p>
            </div>
            <div className="fee-target-toggle" role="group" aria-label="Fee target">
              <button type="button" className={form.targetType === "STUDENT" ? "active" : ""} onClick={() => { setSelectedStudent(null); setForm({ ...form, targetType: "STUDENT", studentId: "" }); }}>Select Student</button>
              <button type="button" className={form.targetType === "SECTION" ? "active" : ""} onClick={() => { setForm({ ...form, targetType: "SECTION", studentId: "" }); setSelectedStudent(null); }}>Whole Section</button>
            </div>
            {form.targetType === "STUDENT" ? (
              <div className="fee-student-field">
                <SearchableSelect
                  inputMode
                  value={selectedStudent?.id ?? ""}
                  onChange={(studentId) => {
                    if (!studentId) {
                      setSelectedStudent(null);
                      setForm({ ...form, studentId: "" });
                      return;
                    }
                    const student = data.students.find((item) => item.id === studentId);
                    if (student) {
                      setSelectedStudent(student);
                      setForm({ ...form, studentId });
                    }
                  }}
                  options={feeStudentSelectOptions}
                  placeholder="Search and select a student"
                  searchPlaceholder="Type name or roll number (e.g. Ram or 2024)…"
                  emptyMessage={studentsLoading ? "Loading students…" : "No students match your search."}
                  loading={studentsLoading}
                  clearable
                />
                <p className="fee-student-hint">Filters names and roll numbers as you type. The dropdown list uses smooth scrolling.</p>
                {studentPoolTotal != null && studentPoolTotal > data.students.length ? (
                  <p className="fee-student-hint fee-student-hint--warn">This section has {studentPoolTotal} students; the first {data.students.length} are loaded. Search within this list to pick someone.</p>
                ) : null}
              </div>
            ) : (
              <p className="db-empty fee-target-section-note">This fee will be assigned to every active, unarchived student in the selected section.</p>
            )}
          </section>
        ) : null}

        {canShowFeeFields ? (
          <section className="fee-target-card fee-details-section">
            <div className="fee-details-panel">
              <div className="fee-form-heading">
                <h2>Fee Details</h2>
                <p>Set the fee head, amount, and due date. Remarks are optional.</p>
              </div>
              <div className="fee-details-grid">
                <Field label="Fee Head"><Input value={form.feeHead} onChange={(feeHead) => setForm({ ...form, feeHead })} required /></Field>
                <Field label="Fee Amount"><Input type="number" min="1" value={form.feeAmount} onChange={(feeAmount) => setForm({ ...form, feeAmount })} required /></Field>
                <Field label="Deadline"><Input type="date" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} required /></Field>
                <Field label="Remarks" className="fee-remarks-field"><Input value={form.remarks} onChange={(remarks) => setForm({ ...form, remarks })} placeholder="Optional note visible in records" /></Field>
              </div>
              <button className="db-submit" disabled={isSaving}>{isSaving ? "Assigning..." : "Assign Fee Structure"}</button>
            </div>
          </section>
        ) : null}
      </form>
    </FeeShell>
  );
}

type FeeData = ReturnType<typeof useFeeStructureData>;

function useFeeStructureData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<FeeStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentPoolTotal, setStudentPoolTotal] = useState<number | null>(null);

  const fetchJson = useCallback(async <T,>(path: string) => {
    const response = await authFetch(path);
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  }, [authFetch]);

  const sendJson = useCallback(async <T,>(path: string, body: unknown, method = "POST") => {
    const response = await authFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw await responseError(response);
    return (await response.json().catch(() => ({}))) as T;
  }, [authFetch]);

  const loadCatalogs = useCallback(async () => {
    const [campusPage, programPage, branchPage, batchPage, classPage, sectionPage] = await Promise.all([
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100")
    ]);
    setCampuses(campusPage.items);
    setPrograms(programPage.items);
    setBranches(branchPage.items);
    setBatches(batchPage.items);
    setClasses(classPage.items);
    setSections(sectionPage.items);
  }, [fetchJson]);

  const loadFeeStudentsForSection = useCallback(async (sectionId: string) => {
    setStudentsLoading(true);
    setStudentPoolTotal(null);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100", sectionId });
      const page = await fetchJson<PaginatedResponse<FeeStudent>>(`/api/fees/students/search?${params.toString()}`);
      setStudents(page.items);
      setStudentPoolTotal(page.total);
    } finally {
      setStudentsLoading(false);
    }
  }, [fetchJson]);

  const clearFeeStudents = useCallback(() => {
    setStudents([]);
    setStudentPoolTotal(null);
  }, []);

  const assignFee = useCallback((body: unknown) => sendJson("/api/fees/assign", body), [sendJson]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalogs().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load fee options", "error"));
  }, [loadCatalogs, showToast]);

  return { assignFee, batches, branches, campuses, classes, clearFeeStudents, loadFeeStudentsForSection, programs, sections, studentPoolTotal, students, studentsLoading };
}

function useFeeOptions(data: FeeData, form: FeeForm) {
  return useMemo(() => {
    const programs = programsForOperationalCampus(data.programs, form.campusId, data.campuses);
    const branches = data.branches.filter((item) => item.programId === form.programId);
    const batches = data.batches.filter((item) => item.branchId === form.branchId);
    const batchClasses = data.classes.filter((item) => item.batchId === form.batchId);
    const years = [...new Set(batchClasses.map((item) => item.yearNumber))].sort((a, b) => a - b);
    const classes = batchClasses.filter((item) => !form.yearNumber || item.yearNumber === Number(form.yearNumber));
    const sections = data.sections.filter((item) => item.classId === form.classId);
    return { programs, branches, batches, years, classes, sections };
  }, [data.batches, data.branches, data.classes, data.programs, data.sections, form.batchId, form.branchId, form.campusId, form.classId, form.programId, form.yearNumber]);
}

function FeeShell({
  children,
  title,
  variant = "workflow",
  backHref
}: {
  children: ReactNode;
  title: string;
  variant?: "main" | "workflow";
  backHref?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className="db-workflow min-h-screen promotion-workflow-layout">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? (
            <AdminWorkflowMenuButton />
          ) : backHref ? (
            <Link to={backHref} className="db-icon-button" aria-label="Back">
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
          <ProfileMenuButton />
        </div>
      </header>
      <div className="db-workflow-body promotion-body">{children}</div>
    </main>
  );
}

function PlainSelect({ onChange, options, placeholder, value }: { value: string; onChange: (value: string) => void; options: [string, string][]; placeholder: string }) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchable={false}
      clearable={false}
    />
  );
}

function Field({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <label className={`db-field ${className}`.trim()}><span>{label}</span>{children}</label>;
}
function Input({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />; }

function validateFeeForm(form: FeeForm, selectedStudent: FeeStudent | null) {
  if (!form.campusId || !form.programId || !form.branchId || !form.classId || !form.sectionId) return "Complete campus, department, branch, class, and section.";
  if (form.targetType === "STUDENT" && !selectedStudent) return "Select a student before assigning fee.";
  if (!form.feeHead.trim()) return "Fee head is required.";
  if (!Number(form.feeAmount) || Number(form.feeAmount) <= 0) return "Enter a valid fee amount.";
  if (!form.deadline) return "Deadline is required.";
  return "";
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { FormEvent, InputHTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { UserAvatar } from "../shared/UserAvatar";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { useStudentNavigate, useStudentPaths, useStudentPortal } from "./student-portal-context";
import { WfBtn } from "../shared/WfBtn";

type StudentStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type StudentCreator = { id: string; fullName: string; username?: string | null; type: string };
type StudentListItem = {
  id: string;
  identity: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    fatherName?: string | null;
    rollNumber: string;
    status: StudentStatus;
  };
  createdBy?: StudentCreator | null;
  structure: {
    campus: Campus;
    operationalCampus?: Campus | null;
    program: Program;
    branch: Branch;
    batch: Batch;
    class: AcademicClass;
    section: Section;
  };
};
type StudentResponse = { student: StudentListItem };
type StudentForm = {
  fullName: string;
  fatherName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  rollNumber: string;
  password: string;
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  semester: string;
  classId: string;
  sectionId: string;
};

const emptyForm = (): StudentForm => ({
  fullName: "",
  fatherName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  rollNumber: "",
  password: "",
  campusId: "",
  programId: "",
  branchId: "",
  batchId: "",
  semester: "",
  classId: "",
  sectionId: ""
});

export function StudentsHomePage() {
  const navigate = useStudentNavigate();
  const paths = useStudentPaths();
  const { homeTitle } = useStudentPortal();

  return (
    <StudentShell title={homeTitle} variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate(paths.add)}>Add Student</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Student Records">
        <OptionActionButton onClick={() => navigate(paths.modify)}>Modify Student</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate(paths.delete)}>Delete Student</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate(paths.existingRecords)}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate(paths.history)}>History</OptionActionButton>
      </WorkflowSection>
    </StudentShell>
  );
}

export function StudentsExistingRecordsPage() {
  const { variant } = useStudentPortal();
  const data = useStudentData({ loadCatalogs: variant === "admin" });
  const [campusId, setCampusId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void data.searchStudents(search, campusId || undefined, 1, 100);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campusId, data.searchStudents, search]);

  const panel = (
    <>
      <ExistingRecordsPageIntro title="Students catalog" description="Browse students already saved in KIET ERP." />
      <ExistingRecordsPanel
        title="Students"
        total={data.total}
        campusId={campusId}
        campusOptions={data.campuses.map((campus) => [campus.id, campus.code])}
        onCampusChange={setCampusId}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or roll number"
        columns={[
          { header: "Roll" },
          { header: "Name" },
          { header: "Campus" },
          { header: "Department" },
          { header: "Section" },
          { header: "Added by" }
        ]}
        rows={data.students.map((student) => ({
          id: student.id,
          cells: [
            student.identity.rollNumber,
            student.identity.fullName,
            student.structure.operationalCampus?.code ?? student.structure.campus.code,
            student.structure.program.code,
            student.structure.section.name,
            student.createdBy?.fullName ?? "-"
          ]
        }))}
      />
    </>
  );

  if (variant === "teacher") {
    return <StudentShell title="Existing records" variant="workflow">{panel}</StudentShell>;
  }

  return <WorkflowExistingRecordsPageShell title="Existing records">{panel}</WorkflowExistingRecordsPageShell>;
}

export function AddStudentPage() {
  const data = useStudentData({ loadCatalogs: true });
  const navigate = useStudentNavigate();
  const paths = useStudentPaths();
  const { api } = useStudentPortal();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const options = useStudentOptions(data, form);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateStudentForm(form);
    if (error) {
      showToast(error, "error");
      setStep(error.includes("section") || error.includes("structure") ? 2 : 1);
      return;
    }
    setIsSaving(true);
    try {
      await data.sendJson(api.createPath, studentPayload(form));
      showToast("Student created successfully");
      void navigate(paths.home);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create student", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <StudentShell title="Add Student">
      <form className="teacher-flow" onSubmit={(event) => void submit(event)}>
        <StudentStepper step={step} setStep={setStep} />
        {step === 1 ? <StudentIdentityStep form={form} setForm={setForm} includePassword /> : null}
        {step === 2 ? <StudentStructureStep data={data} form={form} options={options} setForm={setForm} /> : null}
        <div className="teacher-flow-actions db-form-actions">
          <WfBtn type="button" disabled={step === 1} onClick={() => setStep(1)}>Back</WfBtn>
          {step === 1 ? (
            <WfBtn
              type="button"
              variant="primary"
              onClick={() => {
                const error = validateStudentIdentityForm(form, false, true);
                if (error) {
                  showToast(error, "error");
                  return;
                }
                setStep(2);
              }}
            >
              Next
            </WfBtn>
          ) : (
            <WfBtn type="submit" variant="primary" disabled={isSaving}>{isSaving ? "Saving..." : "Submit Student"}</WfBtn>
          )}
        </div>
      </form>
    </StudentShell>
  );
}

export function ModifyStudentPage() {
  return <StudentLookupPage mode="modify" />;
}

export function DeleteStudentPage() {
  return <StudentLookupPage mode="delete" />;
}

function StudentLookupPage({ mode }: { mode: "modify" | "delete" }) {
  const data = useStudentData();
  const navigate = useStudentNavigate();
  const paths = useStudentPaths();
  const { api } = useStudentPortal();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [campusId, setCampusId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentListItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const { searchStudents } = data;
  const options = useStudentOptions(data, form);

  useEffect(() => {
    if (query.trim() && campusId) {
      void searchStudents(query, campusId);
    }
  }, [campusId, query, searchStudents]);

  async function selectStudent(student: StudentListItem) {
    const detail = await data.studentDetails(student.id);
    setSelected(detail);
    setForm(formFromStudent(detail));
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const error = validateStudentForm(form, true);
    if (error) {
      showToast(error, "error");
      return;
    }
    setIsSaving(true);
    try {
      const result = await data.sendJson<StudentResponse>(api.updatePath(selected.id), studentPayload(form, true), "PATCH");
      setSelected(result.student);
      setForm(formFromStudent(result.student));
      showToast("Student updated successfully");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update student", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveStudent() {
    if (!selected) return;
    const ok = await confirm({
      title: "Archive student?",
      message: "Existing attendance, fees, marks, and history remain in the database.",
      itemName: selected.identity.fullName,
      confirmLabel: "Archive",
      icon: Trash2
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      await data.sendJson(api.archivePath(selected.id), {}, "DELETE");
      showToast("Student archived successfully", "warning");
      void navigate(paths.home);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive student", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <StudentShell title={mode === "modify" ? "Modify Student" : "Delete Student"}>
      <section className="db-card db-form">
        <Field label="Campus"><SearchableSelect value={campusId} options={data.campuses.map((item) => [item.id, item.code])} onChange={(value) => { setCampusId(value); setSelected(null); }} /></Field>
        <SearchInput query={query} setQuery={setQuery} placeholder="Search student name or roll number" />
        {data.students.length ? <StudentSuggestions students={data.students} onSelect={(student) => void selectStudent(student)} /> : null}
      </section>

      {selected && mode === "modify" ? (
        <form className="db-card db-form student-edit-card" onSubmit={(event) => void submitUpdate(event)}>
          <StudentProfileHeader student={selected} />
          <StudentIdentityStep form={form} setForm={setForm} />
          <StudentStructureStep data={data} form={form} options={options} setForm={setForm} />
          <div className="db-form-actions">
            <WfBtn type="submit" variant="primary" disabled={isSaving}>{isSaving ? "Saving..." : "Submit Changes"}</WfBtn>
          </div>
        </form>
      ) : null}

      {selected && mode === "delete" ? (
        <section className="db-card db-form">
          <div className="db-result-head">
            <StudentProfileHeader student={selected} />
            <WfBtn type="button" variant="danger" disabled={isSaving} onClick={() => void archiveStudent()}>
              <Trash2 size={18} /> {isSaving ? "Archiving..." : "Delete"}
            </WfBtn>
          </div>
          <StudentDetails student={selected} />
        </section>
      ) : null}
      {dialog}
    </StudentShell>
  );
}

function StudentIdentityStep({ form, includePassword = false, setForm }: { form: StudentForm; includePassword?: boolean; setForm: (form: StudentForm) => void }) {
  return (
    <section className="db-card db-form teacher-step-card">
      <div>
        <h2>Student Details</h2>
        <p>Name, contact details, date of birth, and roll/admission number. Initial login password matches the roll number.</p>
      </div>
      <div className="teacher-form-grid">
        <Field label="Name"><Input value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} required /></Field>
        <Field label="Father Name"><Input value={form.fatherName} onChange={(fatherName) => setForm({ ...form, fatherName })} required /></Field>
        <Field label="Phone Number"><Input value={form.phone} onChange={(phone) => setForm({ ...form, phone })} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required /></Field>
        <Field label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={(dateOfBirth) => setForm({ ...form, dateOfBirth })} /></Field>
        <Field label="Roll Number / Admission No.">
          <Input
            value={form.rollNumber}
            onChange={(rollNumber) => setForm({ ...form, rollNumber, password: normalizeStudentRoll(rollNumber) })}
            required
          />
        </Field>
        {includePassword ? (
          <Field label="Initial Password">
            <Input value={form.password} onChange={() => undefined} readOnly required />
          </Field>
        ) : null}
      </div>
    </section>
  );
}

function StudentStructureStep({ data, form, options, setForm }: { data: StudentData; form: StudentForm; options: StudentOptions; setForm: (form: StudentForm) => void }) {
  return (
    <section className="db-card db-form teacher-step-card">
      <div>
        <h2>Academic Structure</h2>
        <p>Each selection filters the next dropdown so invalid relationships are avoided before submit.</p>
      </div>
      <div className="teacher-form-grid">
        <Field label="Campus"><SearchableSelect value={form.campusId} options={data.campuses.map((item) => [item.id, item.code])} onChange={(campusId) => setForm({ ...form, campusId, programId: "", branchId: "", batchId: "", semester: "", classId: "", sectionId: "" })} searchable={false} /></Field>
        <Field label="Department"><SearchableSelect value={form.programId} options={options.programs.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(programId) => setForm({ ...form, programId, branchId: "", batchId: "", semester: "", classId: "", sectionId: "" })} searchable={false} /></Field>
        <Field label="Branch"><SearchableSelect value={form.branchId} options={options.branches.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(branchId) => setForm({ ...form, branchId, batchId: "", semester: "", classId: "", sectionId: "" })} searchable={false} /></Field>
        <Field label="Batch"><SearchableSelect value={form.batchId} options={options.batches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => setForm({ ...form, batchId, semester: "", classId: "", sectionId: "" })} searchable={false} /></Field>
        <Field label="Class"><SearchableSelect value={form.classId} options={options.classes.map((item) => [item.id, item.label || `Semester ${item.semesterNumber}`])} onChange={(classId) => setForm({ ...form, classId, sectionId: "" })} searchable={false} /></Field>
        <Field label="Section"><SearchableSelect value={form.sectionId} options={options.sections.map((item) => [item.id, item.name])} onChange={(sectionId) => setForm({ ...form, sectionId })} searchable={false} /></Field>
      </div>
    </section>
  );
}

function StudentDetails({ student }: { student: StudentListItem }) {
  return (
    <div className="db-detail-grid">
      <Info label="Name" value={student.identity.fullName} />
      <Info label="Father Name" value={student.identity.fatherName || "-"} />
      <Info label="Phone Number" value={student.identity.phone || "-"} />
      <Info label="Email" value={student.identity.email || "-"} />
      <Info label="Date of Birth" value={student.identity.dateOfBirth || "-"} />
      <Info label="Roll Number" value={student.identity.rollNumber} />
      <Info label="Campus" value={student.structure.campus.code} />
      <Info label="Department" value={student.structure.program.code} />
      <Info label="Branch" value={student.structure.branch.code} />
      <Info label="Batch" value={`${student.structure.batch.startYear}-${student.structure.batch.endYear}`} />
      <Info label="Semester" value={String(student.structure.class.semesterNumber)} />
      <Info label="Class" value={student.structure.class.label || `Semester ${student.structure.class.semesterNumber}`} />
      <Info label="Section" value={student.structure.section.name} />
      <Info label="Added by" value={student.createdBy?.fullName ?? "-"} />
    </div>
  );
}

function StudentProfileHeader({ student }: { student: StudentListItem }) {
  return (
    <div className="teacher-profile-head">
      <UserAvatar
        fullName={student.identity.fullName}
        role="STUDENT"
        id={student.id}
        email={student.identity.email}
        size="lg"
      />
      <div>
        <h2>{student.identity.fullName}</h2>
        <p>{student.identity.rollNumber} / {student.structure.campus.code}</p>
      </div>
    </div>
  );
}

type StudentData = ReturnType<typeof useStudentData>;
type StudentOptions = ReturnType<typeof useStudentOptions>;

function useStudentData(options: { loadCatalogs?: boolean } = {}) {
  const loadCatalogsOnMount = options.loadCatalogs ?? true;
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { api, variant } = useStudentPortal();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

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
    if (variant === "teacher" && api.catalogPath) {
      const catalog = await fetchJson<{
        campuses: Campus[];
        programs: Program[];
        branches: Branch[];
        batches: Batch[];
        classes: AcademicClass[];
        sections: Section[];
      }>(api.catalogPath);
      setCampuses(catalog.campuses);
      setPrograms(catalog.programs);
      setBranches(catalog.branches);
      setBatches(catalog.batches);
      setClasses(catalog.classes);
      setSections(catalog.sections);
      return;
    }

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
  }, [api.catalogPath, fetchJson, variant]);

  const searchStudents = useCallback(async (query: string, campusId?: string, page = 1, pageSize = 10) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: query, status: "ACTIVE" });
    if (campusId) params.set("campusId", campusId);
    const result = await fetchJson<PaginatedResponse<StudentListItem>>(`${api.searchPath}?${params.toString()}`);
    setStudents(result.items);
    setTotal(result.total);
  }, [api.searchPath, fetchJson]);

  const studentDetails = useCallback(async (id: string) => {
    const response = await fetchJson<StudentResponse>(api.detailPath(id));
    return response.student;
  }, [api.detailPath, fetchJson]);

  useEffect(() => {
    if (!loadCatalogsOnMount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalogs().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load student options", "error"));
  }, [loadCatalogs, loadCatalogsOnMount, showToast]);

  useEffect(() => {
    return () => {
      setStudents([]);
      setTotal(0);
    };
  }, []);

  return { batches, branches, campuses, classes, programs, searchStudents, sections, sendJson, studentDetails, students, total };
}

function useStudentOptions(data: StudentData, form: StudentForm) {
  return useMemo(() => {
    const programs = programsForOperationalCampus(data.programs, form.campusId, data.campuses);
    const branches = data.branches.filter((item) => item.programId === form.programId);
    const batches = data.batches.filter((item) => item.branchId === form.branchId);
    const batchClasses = data.classes.filter((item) => item.batchId === form.batchId);
    const semesters = [...new Set(batchClasses.map((item) => item.semesterNumber))].sort((a, b) => a - b);
    const classes = batchClasses.filter((item) => !form.semester || item.semesterNumber === Number(form.semester));
    const sections = data.sections.filter((item) => item.classId === form.classId);
    return { programs, branches, batches, semesters, classes, sections };
  }, [data.batches, data.branches, data.classes, data.programs, data.sections, form.batchId, form.branchId, form.campusId, form.classId, form.programId, form.semester]);
}

function StudentShell({ children, title, variant = "workflow" }: { children: ReactNode; title: string; variant?: "main" | "workflow" }) {
  const navigate = useStudentNavigate();
  const paths = useStudentPaths();
  const { variant: portalVariant } = useStudentPortal();

  if (portalVariant === "teacher") {
    const body = (
      <>
        {variant === "workflow" ? (
          <div className="mb-4">
            <button type="button" className="db-icon-button" onClick={() => navigate(paths.home)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          </div>
        ) : null}
        {children}
      </>
    );
    return (
      <div className="portal-engage-workflow ann-workflow">
        <section className="db-workflow-body ann-workflow-body">{body}</section>
      </div>
    );
  }

  return (
    <main className="db-workflow min-h-screen">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? <AdminWorkflowMenuButton /> : <button type="button" className="db-icon-button" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>}
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <div className="db-workflow-body ann-workflow-body promotion-body">{children}</div>
    </main>
  );
}

function StudentStepper({ setStep, step }: { step: number; setStep: (step: number) => void }) {
  return (
    <div className="teacher-stepper">
      {["Details", "Structure"].map((label, index) => {
        const value = index + 1;
        return <button key={label} type="button" className={step === value ? "active" : ""} onClick={() => setStep(value)}><span>{value}</span>{label}</button>;
      })}
    </div>
  );
}

function StudentSuggestions({ onSelect, students }: { students: StudentListItem[]; onSelect: (student: StudentListItem) => void }) {
  return (
    <div className="db-suggestions">
      {students.map((student) => (
        <button key={student.id} type="button" onClick={() => onSelect(student)}>
          <strong>{student.identity.fullName}</strong>
          <span>{student.identity.rollNumber}</span>
        </button>
      ))}
    </div>
  );
}

function SearchInput({ placeholder, query, setQuery }: { placeholder: string; query: string; setQuery: (value: string) => void }) {
  return <div className="db-search-bar"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></div>;
}

function PaginationControls({ onPage, page, pageSize, total }: { onPage: (page: number) => void; page: number; pageSize: number; total: number }) {
  const canGoNext = page * pageSize < total;
  if (total <= pageSize && page === 1) return null;
  return (
    <div className="db-history-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>Previous</button>
      <span>Page {page}</span>
      <button type="button" disabled={!canGoNext} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function ActionGroup({ children, title }: { children: ReactNode; title: string }) {
  return <WorkflowSection title={title}>{children}</WorkflowSection>;
}

function GlassButton({ children, onClick, tone = "default" }: { children: ReactNode; onClick: () => void; tone?: "default" | "danger" }) {
  return <OptionActionButton tone={tone} onClick={onClick}>{children}</OptionActionButton>;
}
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="db-field"><span>{label}</span>{children}</label>; }
function Input({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="db-input" {...props} onChange={(event) => onChange(event.target.value)} />; }
function Info({ label, value }: { label: string; value: string }) { return <div className="db-info"><span>{label}</span><strong>{value}</strong></div>; }

function formFromStudent(student: StudentListItem): StudentForm {
  return {
    ...emptyForm(),
    fullName: student.identity.fullName,
    fatherName: student.identity.fatherName ?? "",
    phone: student.identity.phone ?? "",
    email: student.identity.email ?? "",
    dateOfBirth: student.identity.dateOfBirth ?? "",
    rollNumber: student.identity.rollNumber,
    campusId: student.structure.campus.id,
    programId: student.structure.program.id,
    branchId: student.structure.branch.id,
    batchId: student.structure.batch.id,
    semester: String(student.structure.class.semesterNumber),
    classId: student.structure.class.id,
    sectionId: student.structure.section.id
  };
}

function normalizeStudentRoll(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function studentPayload(form: StudentForm, update = false) {
  return {
    fullName: form.fullName,
    fatherName: form.fatherName.trim(),
    phone: form.phone || undefined,
    email: form.email || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    rollNumber: form.rollNumber,
    campusId: form.campusId,
    programId: form.programId,
    branchId: form.branchId,
    batchId: form.batchId,
    classId: form.classId,
    sectionId: form.sectionId,
    ...(update ? {} : { password: form.password.trim() || normalizeStudentRoll(form.rollNumber) })
  };
}

function validateStudentIdentityForm(form: StudentForm, update = false, includePassword = false) {
  if (!form.fullName.trim()) return "Student name is required.";
  if (!update && !form.fatherName.trim()) return "Father name is required.";
  if (form.fatherName.trim() && form.fatherName.trim().length < 2) return "Father name must be at least 2 characters.";
  if (!form.email.trim()) return "Student email is required.";
  if (!form.rollNumber.trim()) return "Roll number is required.";
  if (!update && includePassword && !(form.password.trim() || normalizeStudentRoll(form.rollNumber))) {
    return "Roll/admission number is required for the initial password.";
  }
  return "";
}

function validateStudentForm(form: StudentForm, update = false) {
  const identityError = validateStudentIdentityForm(form, update);
  if (identityError) return identityError;
  if (!form.campusId || !form.programId || !form.branchId || !form.batchId || !form.classId || !form.sectionId) return "Complete student academic structure.";
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

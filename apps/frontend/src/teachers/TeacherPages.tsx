import { ArrowLeft, Plus, Search, Trash2, UserRoundCog } from "lucide-react";
import { FormEvent, InputHTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { ExistingRecordsPanel, ExistingRecordsPageIntro, WorkflowExistingRecordsPageShell } from "../shared/WorkflowExistingRecords";
import { SearchableSelect } from "../shared/SearchableSelect";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { UserAvatar } from "../shared/UserAvatar";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section, Subject } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import { formatAcademicYearLabel } from "../student-portal/fees/student-fees-types";

type TeacherRole = "HTPO" | "CTPO" | "STPO";
type TeacherStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type AssignmentDraft = {
  id?: string;
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  semester: string;
  classId: string;
  role: TeacherRole;
  sectionId?: string | null;
  subjectId?: string | null;
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
type TeacherDetail = TeacherListItem & { assignments: AssignmentDraft[]; meta?: { createdAt: string; updatedAt: string; version: number } };
type TeacherDetailResponse = { teacher: TeacherDetail };
type IdentityDraft = {
  fullName: string;
  employeeCode: string;
  email: string;
  phone: string;
  joinedOn: string;
  password: string;
};

const emptyIdentity = (): IdentityDraft => ({
  fullName: "",
  employeeCode: "",
  email: "",
  phone: "",
  joinedOn: "",
  password: ""
});

const emptyAssignment = (): AssignmentDraft => ({
  campusId: "",
  programId: "",
  branchId: "",
  batchId: "",
  semester: "",
  classId: "",
  role: "HTPO"
});

export function TeachersHomePage() {
  const navigate = useNavigate();

  return (
    <TeacherShell title="Teachers" variant="main">
      <WorkflowSection title="Create Records">
        <OptionActionButton onClick={() => navigate("/teachers/add-teacher")}>Add Teacher</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Teacher Records">
        <OptionActionButton onClick={() => navigate("/teachers/modify-teacher")}>Modify Teacher</OptionActionButton>
        <OptionActionButton tone="danger" onClick={() => navigate("/teachers/delete-teacher")}>Delete Teacher</OptionActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <OptionActionButton onClick={() => navigate("/teachers/existing-records")}>Existing records</OptionActionButton>
        <OptionActionButton onClick={() => navigate("/teachers/history")}>History</OptionActionButton>
      </WorkflowSection>
    </TeacherShell>
  );
}

export function TeachersExistingRecordsPage() {
  const data = useTeacherData();
  const [campusId, setCampusId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void data.searchTeachers(search, campusId || undefined, 1, 100);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campusId, data.searchTeachers, search]);

  return (
    <WorkflowExistingRecordsPageShell title="Existing records">
      <ExistingRecordsPageIntro title="Teachers catalog" description="Browse teachers already saved in KIET ERP." />
      <ExistingRecordsPanel
        title="Teachers"
        total={data.total}
        campusId={campusId}
        campusOptions={data.campuses.map((campus) => [campus.id, campus.code])}
        onCampusChange={setCampusId}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or employee code"
        columns={[
          { header: "Name" },
          { header: "Employee code" },
          { header: "Email" },
          { header: "Roles" },
          { header: "Assignments" }
        ]}
        rows={data.teachers.map((teacher) => ({
          id: teacher.id,
          cells: [
            teacher.identity.fullName,
            teacher.identity.employeeCode,
            teacher.identity.email,
            Object.keys(teacher.summary.roles).join(", ") || "-",
            String(teacher.summary.assignments)
          ]
        }))}
      />
    </WorkflowExistingRecordsPageShell>
  );
}

export function AddTeacherPage() {
  const data = useTeacherData();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState(emptyIdentity);
  const [assignment, setAssignment] = useState<AssignmentDraft>(emptyAssignment);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const options = useAssignmentOptions(data, assignment);

  function goToStep(targetStep: number) {
    if (targetStep <= step) {
      setStep(targetStep);
      return;
    }

    const identityError = validateIdentity(identity);
    if (identityError) {
      showToast(identityError, "error");
      setStep(1);
      return;
    }

    if (targetStep === 2) {
      setStep(2);
      return;
    }

    if (!ensureAssignmentForReview()) return;
    setStep(3);
  }

  function addAssignment() {
    const normalized = normalizeAssignment(assignment);
    const error = validateAssignment(normalized);
    if (error) {
      showToast(error, "error");
      return;
    }
    const key = assignmentKey(normalized);
    if (assignments.some((item) => assignmentKey(item) === key)) {
      showToast("Duplicate teacher assignment found.", "error");
      return;
    }
    setAssignments((current) => [...current, normalized]);
    showToast("Assignment added", "success");
  }

  function ensureAssignmentForReview() {
    if (assignments.length) return true;
    const normalized = normalizeAssignment(assignment);
    const error = validateAssignment(normalized);
    if (error) {
      showToast(error, "error");
      setStep(2);
      return false;
    }
    setAssignments([normalized]);
    return true;
  }

  function goNext() {
    goToStep(Math.min(3, step + 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 3) {
      goNext();
      return;
    }
    if (!assignments.length) {
      showToast("Add at least one assignment", "error");
      setStep(2);
      return;
    }
    setIsSaving(true);
    try {
      const body = { identity: cleanIdentity(identity), assignments: assignments.map(cleanAssignment) };
      await data.sendJson("/api/teachers/validate", body);
      await data.sendJson("/api/teachers", body);
      showToast("Teacher created successfully");
      void navigate("/teachers");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create teacher", "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <TeacherShell title="Add Teacher">
      <form className="teacher-flow" onSubmit={(event) => void submit(event)}>
        <Stepper step={step} setStep={goToStep} />
        {step === 1 ? <IdentityStep identity={identity} setIdentity={setIdentity} /> : null}
        {step === 2 ? (
          <AssignmentStep
            assignment={assignment}
            assignments={assignments}
            data={data}
            onAdd={addAssignment}
            onAssignment={setAssignment}
            onRemove={(index) => setAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            options={options}
          />
        ) : null}
        {step === 3 ? <ReviewStep assignments={assignments} data={data} identity={identity} onRemove={(index) => setAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} /> : null}
        <div className="teacher-flow-actions">
          <button type="button" className="teacher-secondary" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</button>
          {step < 3 ? (
            <button type="button" className="db-submit" onClick={goNext}>Next</button>
          ) : (
            <button className="db-submit" disabled={isSaving}>{isSaving ? "Saving..." : "Create Teacher"}</button>
          )}
        </div>
      </form>
    </TeacherShell>
  );
}

export function ModifyTeacherPage() {
  return <TeacherLookupPage mode="modify" />;
}

export function DeleteTeacherPage() {
  return <TeacherLookupPage mode="delete" />;
}

function TeacherLookupPage({ mode }: { mode: "modify" | "delete" }) {
  const data = useTeacherData();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TeacherDetail | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", phone: "", joinedOn: "" });
  const [editAssignments, setEditAssignments] = useState<AssignmentDraft[]>([]);
  const [editAssignment, setEditAssignment] = useState<AssignmentDraft>(emptyAssignment);
  const editAssignmentOptions = useAssignmentOptions(data, editAssignment);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { searchTeachers } = data;

  useEffect(() => {
    void searchTeachers(query);
  }, [query, searchTeachers]);

  async function selectTeacher(teacher: TeacherListItem) {
    const detail = await data.teacherDetails(teacher.id);
    setSelected(detail);
    setEditForm({
      fullName: detail.identity.fullName,
      email: detail.identity.email,
      phone: detail.identity.phone ?? "",
      joinedOn: detail.identity.joinedOn ?? ""
    });
    setEditAssignments(detail.assignments.map((item) => ({ ...item, semester: inferAssignmentSemester(item, data) })));
    setEditAssignment(emptyAssignment());
  }

  function inferAssignmentSemester(assignment: AssignmentDraft, catalog: TeacherData) {
    if (assignment.semester) return assignment.semester;
    const classItem = catalog.classes.find((item) => item.id === assignment.classId);
    return classItem ? String(classItem.semesterNumber) : "";
  }

  function addEditAssignment() {
    const normalized = normalizeAssignment(editAssignment);
    const error = validateAssignment(normalized);
    if (error) {
      showToast(error, "error");
      return;
    }
    const key = assignmentKey(normalized);
    if (editAssignments.some((item) => assignmentKey(item) === key)) {
      showToast("Duplicate teacher assignment found.", "error");
      return;
    }
    setEditAssignments((current) => [...current, normalized]);
    setEditAssignment(emptyAssignment());
    showToast("Assignment added", "success");
  }

  async function saveTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    try {
      await data.sendJson<TeacherDetailResponse>(
        `/api/teachers/${selected.id}`,
        {
          fullName: editForm.fullName,
          email: editForm.email,
          phone: normalizeIndianPhone(editForm.phone) || undefined,
          joinedOn: editForm.joinedOn || undefined
        },
        "PATCH"
      );
      await data.sendJson<TeacherDetailResponse>(
        `/api/teachers/${selected.id}/assignments`,
        { assignments: editAssignments.map(cleanAssignment) },
        "PATCH"
      );
      const refreshed = await data.teacherDetails(selected.id);
      setSelected(refreshed);
      setEditAssignments(refreshed.assignments.map((item) => ({ ...item, semester: inferAssignmentSemester(item, data) })));
      showToast("Teacher updated successfully", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update teacher", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveTeacher() {
    if (!selected) return;
    const ok = await confirm({
      title: "Archive teacher?",
      message: "Their login sessions and active assignments will be turned off.",
      itemName: selected.identity.fullName,
      confirmLabel: "Archive",
      icon: Trash2
    });
    if (!ok) return;
    setIsArchiving(true);
    try {
      await data.sendJson(`/api/teachers/${selected.id}`, {}, "DELETE");
      showToast("Teacher archived successfully", "warning");
      void navigate("/teachers");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to archive teacher", "error");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <TeacherShell title={mode === "modify" ? "Modify Teacher" : "Delete Teacher"}>
      <SearchInput query={query} setQuery={setQuery} placeholder="Search teacher name or teacher ID" />
      {data.teachers.length ? <TeacherSuggestions teachers={data.teachers} onSelect={(teacher) => void selectTeacher(teacher)} /> : null}
      {selected && mode === "modify" ? (
        <form className="db-card db-form teacher-step-card" onSubmit={(event) => void saveTeacher(event)}>
          <TeacherProfileCard data={data} teacher={selected} assignments={editAssignments} />
          <div className="teacher-form-grid">
            <Field label="Full Name"><Input value={editForm.fullName} onChange={(fullName) => setEditForm({ ...editForm, fullName })} required /></Field>
            <Field label="Email"><Input type="email" value={editForm.email} onChange={(email) => setEditForm({ ...editForm, email })} required /></Field>
            <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={editForm.phone} onChange={(phone) => setEditForm({ ...editForm, phone: normalizeIndianPhone(phone) })} /></Field>
            <Field label="Joined On"><Input type="date" value={editForm.joinedOn} onChange={(joinedOn) => setEditForm({ ...editForm, joinedOn })} /></Field>
          </div>
          <section className="teacher-modify-assignments">
            <div>
              <h3>Sections &amp; subjects assigned</h3>
              <p>Add or remove HTPO, CTPO, and STPO scopes. CTPO/STPO need a section; STPO also needs a subject.</p>
            </div>
            <div className="teacher-form-grid">
              <Field label="Campus"><SearchableSelect value={editAssignment.campusId} options={data.campuses.map((item) => [item.id, item.code])} onChange={(campusId) => setEditAssignment({ ...editAssignment, campusId, programId: "", branchId: "", batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Department"><SearchableSelect value={editAssignment.programId} options={editAssignmentOptions.programs.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(programId) => setEditAssignment({ ...editAssignment, programId, branchId: "", batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Branch"><SearchableSelect value={editAssignment.branchId} options={editAssignmentOptions.branches.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(branchId) => setEditAssignment({ ...editAssignment, branchId, batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Batch"><SearchableSelect value={editAssignment.batchId} options={editAssignmentOptions.batches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => setEditAssignment({ ...editAssignment, batchId, semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Class"><SearchableSelect value={editAssignment.classId} options={editAssignmentOptions.classes.map((item) => [item.id, classLabel(item)])} onChange={(classId) => setEditAssignment({ ...editAssignment, classId, semester: String(data.classes.find((item) => item.id === classId)?.semesterNumber ?? ""), sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Semester"><SearchableSelect value={editAssignment.semester} options={editAssignmentOptions.semesters.map((item) => [String(item), `Semester ${item}`])} onChange={(semester) => setEditAssignment({ ...editAssignment, semester, classId: data.classes.find((item) => item.id === editAssignment.classId)?.semesterNumber === Number(semester) ? editAssignment.classId : "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
              <Field label="Role"><SearchableSelect value={editAssignment.role} options={[["HTPO", "HTPO"], ["CTPO", "CTPO"], ["STPO", "STPO"]]} onChange={(role) => setEditAssignment({ ...editAssignment, role: role as TeacherRole, sectionId: "", subjectId: "" })} searchable={false} /></Field>
              {editAssignment.role === "HTPO" ? <Field label="Select Branch"><SearchableSelect value={editAssignment.branchId} options={selectedBranchOption(editAssignment, data)} onChange={(branchId) => setEditAssignment({ ...editAssignment, branchId })} placeholder="Select branch above first" searchable={false} /></Field> : null}
              {editAssignment.role !== "HTPO" ? <Field label="Section"><SearchableSelect value={editAssignment.sectionId ?? ""} options={editAssignmentOptions.sections.map((item) => [item.id, item.name])} onChange={(sectionId) => setEditAssignment({ ...editAssignment, sectionId })} searchable={false} /></Field> : null}
              {editAssignment.role === "STPO" ? <Field label="Subject"><SearchableSelect value={editAssignment.subjectId ?? ""} options={editAssignmentOptions.subjects.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(subjectId) => setEditAssignment({ ...editAssignment, subjectId })} searchable={false} /></Field> : null}
            </div>
            <button type="button" className="teacher-add-assignment" onClick={addEditAssignment}><Plus size={16} /> Add assignment</button>
            <AssignmentChips assignments={editAssignments} data={data} onRemove={(index) => setEditAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
          </section>
          <button className="db-submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save Teacher"}</button>
        </form>
      ) : null}
      {selected && mode === "delete" ? (
        <TeacherProfileCard
          data={data}
          teacher={selected}
          assignments={selected.assignments}
          action={mode === "delete" ? <button type="button" className="teacher-delete-button" disabled={isArchiving} onClick={() => void archiveTeacher()}><Trash2 size={18} /> {isArchiving ? "Archiving..." : "Archive"}</button> : null}
        />
      ) : null}
      {!selected ? <p className="db-empty">Search and select a teacher to view profile, role chips, and assignment scopes.</p> : null}
      {dialog}
    </TeacherShell>
  );
}

function IdentityStep({ identity, setIdentity }: { identity: IdentityDraft; setIdentity: (identity: IdentityDraft) => void }) {
  return (
    <section className="db-card db-form teacher-step-card">
      <div>
        <h2>Basic Details</h2>
        <p>Keep identity details short and exact. Employee code is used for login.</p>
      </div>
      <div className="teacher-form-grid">
        <Field label="Full Name"><Input value={identity.fullName} onChange={(fullName) => setIdentity({ ...identity, fullName })} required /></Field>
        <Field label="Teacher ID / Employee Code"><Input value={identity.employeeCode} onChange={(employeeCode) => setIdentity({ ...identity, employeeCode, password: employeeCode })} required /></Field>
        <Field label="Email"><Input type="email" value={identity.email} onChange={(email) => setIdentity({ ...identity, email })} required /></Field>
        <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={identity.phone} onChange={(phone) => setIdentity({ ...identity, phone: normalizeIndianPhone(phone) })} /></Field>
        <Field label="Joined On"><Input type="date" value={identity.joinedOn} onChange={(joinedOn) => setIdentity({ ...identity, joinedOn })} /></Field>
        <Field label="Temporary Password"><Input value={identity.password} onChange={() => undefined} readOnly required /></Field>
      </div>
    </section>
  );
}

function AssignmentStep({
  assignment,
  assignments,
  data,
  onAdd,
  onAssignment,
  onRemove,
  options
}: {
  assignment: AssignmentDraft;
  assignments: AssignmentDraft[];
  data: TeacherData;
  onAdd: () => void;
  onAssignment: (assignment: AssignmentDraft) => void;
  onRemove: (index: number) => void;
  options: AssignmentOptions;
}) {
  return (
    <section className="db-card db-form teacher-step-card">
      <div>
        <h2>Assignments & Scopes</h2>
        <p>Select role scope carefully. CTPO/STPO require section; STPO also requires subject.</p>
      </div>
      <div className="teacher-form-grid">
        <Field label="Campus"><SearchableSelect value={assignment.campusId} options={data.campuses.map((item) => [item.id, item.code])} onChange={(campusId) => onAssignment({ ...assignment, campusId, programId: "", branchId: "", batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Department"><SearchableSelect value={assignment.programId} options={options.programs.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(programId) => onAssignment({ ...assignment, programId, branchId: "", batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Branch"><SearchableSelect value={assignment.branchId} options={options.branches.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(branchId) => onAssignment({ ...assignment, branchId, batchId: "", semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Batch"><SearchableSelect value={assignment.batchId} options={options.batches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => onAssignment({ ...assignment, batchId, semester: "", classId: "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Class"><SearchableSelect value={assignment.classId} options={options.classes.map((item) => [item.id, classLabel(item)])} onChange={(classId) => onAssignment({ ...assignment, classId, semester: String(data.classes.find((item) => item.id === classId)?.semesterNumber ?? ""), sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Semester"><SearchableSelect value={assignment.semester} options={options.semesters.map((item) => [String(item), `Semester ${item}`])} onChange={(semester) => onAssignment({ ...assignment, semester, classId: data.classes.find((item) => item.id === assignment.classId)?.semesterNumber === Number(semester) ? assignment.classId : "", sectionId: "", subjectId: "" })} searchable={false} /></Field>
        <Field label="Role"><SearchableSelect value={assignment.role} options={[["HTPO", "HTPO"], ["CTPO", "CTPO"], ["STPO", "STPO"]]} onChange={(role) => onAssignment({ ...assignment, role: role as TeacherRole, sectionId: "", subjectId: "" })} searchable={false} /></Field>
        {assignment.role === "HTPO" ? <Field label="Select Branch"><SearchableSelect value={assignment.branchId} options={selectedBranchOption(assignment, data)} onChange={(branchId) => onAssignment({ ...assignment, branchId })} placeholder="Select branch above first" searchable={false} /></Field> : null}
        {assignment.role !== "HTPO" ? <Field label="Section"><SearchableSelect value={assignment.sectionId ?? ""} options={options.sections.map((item) => [item.id, item.name])} onChange={(sectionId) => onAssignment({ ...assignment, sectionId })} searchable={false} /></Field> : null}
        {assignment.role === "STPO" ? <Field label="Subject"><SearchableSelect value={assignment.subjectId ?? ""} options={options.subjects.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(subjectId) => onAssignment({ ...assignment, subjectId })} searchable={false} /></Field> : null}
      </div>
      <button type="button" className="teacher-add-assignment" onClick={onAdd}><Plus size={16} /> Add Assignment</button>
      <AssignmentChips assignments={assignments} data={data} onRemove={onRemove} />
    </section>
  );
}

function ReviewStep({ assignments, data, identity, onRemove }: { assignments: AssignmentDraft[]; data: TeacherData; identity: IdentityDraft; onRemove: (index: number) => void }) {
  return (
    <section className="db-card db-form teacher-step-card">
      <div>
        <h2>Review & Submit</h2>
        <p>Confirm teacher identity and scoped role assignments before creating the account.</p>
      </div>
      <div className="db-detail-grid">
        <Info label="Name" value={identity.fullName || "Not entered"} />
        <Info label="Teacher ID" value={identity.employeeCode || "Not entered"} />
        <Info label="Email" value={identity.email || "Not entered"} />
      </div>
      <AssignmentChips assignments={assignments} data={data} onRemove={onRemove} />
    </section>
  );
}

function TeacherProfileCard({
  action,
  assignments,
  data,
  teacher
}: {
  action?: ReactNode;
  assignments: AssignmentDraft[];
  data: TeacherData;
  teacher: TeacherDetail;
}) {
  const roleEntries = Object.entries(teacher.summary.roles);
  const sectionLabels = assignedSectionLabels(assignments, data);
  const subjectLabels = assignedSubjectLabels(assignments, data);
  return (
    <section className="db-card db-form teacher-profile-card">
      <div className="db-result-head">
        <div className="teacher-profile-head">
          <UserAvatar
            fullName={teacher.identity.fullName}
            role="TEACHER"
            id={teacher.id}
            email={teacher.identity.email}
            size="lg"
          />
          <div>
            <h2>{teacher.identity.fullName}</h2>
            <p>{teacher.identity.employeeCode} / {teacher.identity.status}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="teacher-chip-row">
        {roleEntries.length ? roleEntries.map(([role, count]) => <span key={role} className="teacher-role-chip">{role} x {count}</span>) : <span className="teacher-role-chip">No active roles</span>}
      </div>
      <div className="db-detail-grid">
        <Info label="Email" value={teacher.identity.email} />
        <Info label="Phone" value={teacher.identity.phone || "-"} />
        <Info label="Designation" value={teacher.identity.designation || "-"} />
        <Info label="Joined On" value={teacher.identity.joinedOn || "-"} />
        <Info label="Campuses" value={teacher.summary.campuses.join(", ") || "-"} />
        <Info label="Sections Assigned" value={sectionLabels.length ? sectionLabels.join(" · ") : "-"} />
        <Info label="Subjects Assigned" value={subjectLabels.length ? subjectLabels.join(" · ") : "-"} />
      </div>
      <RoleAssignmentChips assignments={assignments} data={data} />
    </section>
  );
}

type TeacherData = ReturnType<typeof useTeacherData>;
type AssignmentOptions = ReturnType<typeof useAssignmentOptions>;

function useTeacherData() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const fetchJson = useCallback(async <T,>(path: string) => {
    const response = await authFetch(path);
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  }, [authFetch]);

  const sendJson = useCallback(async <T,>(path: string, body: unknown, method = "POST") => {
    const response = await authFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  }, [authFetch]);

  const loadCatalogs = useCallback(async () => {
    const [campusPage, programPage, branchPage, batchPage, classPage, sectionPage, subjectPage] = await Promise.all([
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100"),
      fetchJson<PaginatedResponse<Subject>>("/api/core/subjects?pageSize=100")
    ]);
    setCampuses(campusPage.items);
    setPrograms(programPage.items);
    setBranches(branchPage.items);
    setBatches(batchPage.items);
    setClasses(classPage.items);
    setSections(sectionPage.items);
    setSubjects(subjectPage.items);
  }, [fetchJson]);

  const searchTeachers = useCallback(async (query: string, campusId?: string, page = 1, pageSize = 10) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: query, status: "ACTIVE" });
    if (campusId) params.set("campusId", campusId);
    const result = await fetchJson<PaginatedResponse<TeacherListItem>>(`/api/teachers/search?${params.toString()}`);
    setTeachers(result.items);
    setTotal(result.total);
  }, [fetchJson]);

  const teacherDetails = useCallback(async (id: string) => {
    const response = await fetchJson<TeacherDetailResponse>(`/api/teachers/${id}`);
    return response.teacher;
  }, [fetchJson]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalogs().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load teacher options", "error"));
  }, [loadCatalogs, showToast]);

  return { batches, branches, campuses, classes, programs, searchTeachers, sections, sendJson, subjects, teacherDetails, teachers, total };
}

function useAssignmentOptions(data: TeacherData, assignment: AssignmentDraft) {
  const selectedClass = data.classes.find((item) => item.id === assignment.classId);
  const batchClasses = data.classes.filter((item) => item.batchId === assignment.batchId);
  return useMemo(() => ({
    programs: programsForOperationalCampus(data.programs, assignment.campusId, data.campuses),
    branches: data.branches.filter((item) => item.programId === assignment.programId),
    batches: data.batches.filter((item) => item.branchId === assignment.branchId),
    semesters: [...new Set(batchClasses.map((item) => item.semesterNumber))].sort((a, b) => a - b),
    classes: batchClasses,
    sections: data.sections.filter((item) => item.classId === assignment.classId),
    subjects: data.subjects.filter((item) => item.branchId === assignment.branchId && item.semesterNumber === selectedClass?.semesterNumber)
  }), [assignment, batchClasses, data.branches, data.batches, data.programs, data.sections, data.subjects, selectedClass?.semesterNumber]);
}

function TeacherShell({ children, title, variant = "workflow" }: { children: ReactNode; title: string; variant?: "main" | "workflow" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <main className="db-workflow ann-workflow min-h-screen promotion-workflow-layout">
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

function Stepper({ setStep, step }: { step: number; setStep: (step: number) => void }) {
  return (
    <div className="teacher-stepper">
      {["Identity", "Assignments", "Review"].map((label, index) => {
        const value = index + 1;
        return <button key={label} type="button" className={step === value ? "active" : ""} onClick={() => setStep(value)}><span>{value}</span>{label}</button>;
      })}
    </div>
  );
}

function RoleAssignmentChips({ assignments, data }: { assignments: AssignmentDraft[]; data: TeacherData }) {
  const htpoOnly = assignments.filter((item) => item.role === "HTPO");
  if (!htpoOnly.length) return null;
  return (
    <div className="teacher-assignment-list">
      {htpoOnly.map((assignment, index) => (
        <div key={`${assignmentKey(assignment)}-${index}`} className="teacher-assignment-chip">
          <div>
            <strong>{assignment.role}</strong>
            <span>{assignmentLabel(assignment, data)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function assignedSectionLabels(assignments: AssignmentDraft[], data: TeacherData) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const assignment of assignments) {
    if (!assignment.sectionId) continue;
    const label = formatSectionAssignmentLabel(assignment, data);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function assignedSubjectLabels(assignments: AssignmentDraft[], data: TeacherData) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const assignment of assignments) {
    if (!assignment.subjectId) continue;
    const label = formatSubjectAssignmentLabel(assignment, data);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function formatSectionAssignmentLabel(assignment: AssignmentDraft, data: TeacherData) {
  const section = data.sections.find((item) => item.id === assignment.sectionId);
  if (!section) return "";
  const classItem = data.classes.find((item) => item.id === (section.classId || assignment.classId));
  const program = data.programs.find((item) => item.id === assignment.programId);
  const yearLabel = classItem ? formatAcademicYearLabel(classItem.yearNumber) : "";
  const departmentName = program?.name || program?.code || "";
  return [section.name, yearLabel, departmentName].filter(Boolean).join(" · ");
}

function formatSubjectAssignmentLabel(assignment: AssignmentDraft, data: TeacherData) {
  const subject = data.subjects.find((item) => item.id === assignment.subjectId);
  if (!subject) return "";
  const program = data.programs.find((item) => item.id === assignment.programId);
  const departmentName = program?.name || program?.code || "";
  return [subject.name, departmentName].filter(Boolean).join(" · ");
}

function AssignmentChips({ assignments, data, onRemove, readonly = false }: { assignments: AssignmentDraft[]; data: TeacherData; onRemove?: (index: number) => void; readonly?: boolean }) {
  if (!assignments.length) return <p className="db-empty">No assignments added yet.</p>;
  return (
    <div className="teacher-assignment-list">
      {assignments.map((assignment, index) => (
        <div key={`${assignmentKey(assignment)}-${index}`} className="teacher-assignment-chip">
          <div>
            <strong>{assignment.role}</strong>
            <span>{assignmentLabel(assignment, data)}</span>
          </div>
          {!readonly && onRemove ? <button type="button" onClick={() => onRemove(index)}>Remove</button> : null}
        </div>
      ))}
    </div>
  );
}

function TeacherSuggestions({ onSelect, teachers }: { teachers: TeacherListItem[]; onSelect: (teacher: TeacherListItem) => void }) {
  return (
    <div className="db-suggestions">
      {teachers.map((teacher) => (
        <button key={teacher.id} type="button" onClick={() => onSelect(teacher)}>
          <strong>{teacher.identity.fullName}</strong>
          <span>{teacher.identity.employeeCode}</span>
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

function cleanIdentity(identity: IdentityDraft) {
  const employeeCode = identity.employeeCode.trim();
  return {
    fullName: identity.fullName,
    employeeCode,
    email: identity.email,
    phone: normalizeIndianPhone(identity.phone) || undefined,
    joinedOn: identity.joinedOn || undefined,
    password: employeeCode
  };
}

function validateIdentity(identity: IdentityDraft) {
  if (identity.fullName.trim().length < 2) return "Enter teacher full name before continuing.";
  if (identity.employeeCode.trim().length < 2) return "Enter teacher ID before continuing.";
  if (!identity.email.trim()) return "Enter teacher email before continuing.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim())) return "Enter a valid teacher email before continuing.";
  const phone = normalizeIndianPhone(identity.phone);
  if (identity.phone.trim() && phone.length !== 10) return "Phone number must be 10 digits.";
  return "";
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  const withoutLeadingZero = withoutCountryCode.startsWith("0") && withoutCountryCode.length > 10 ? withoutCountryCode.slice(1) : withoutCountryCode;
  return withoutLeadingZero.slice(0, 10);
}

function normalizeAssignment(assignment: AssignmentDraft): AssignmentDraft {
  if (assignment.role === "HTPO") {
    return {
      ...assignment,
      batchId: "",
      semester: "",
      classId: "",
      sectionId: undefined,
      subjectId: undefined
    };
  }

  return {
    ...assignment,
    sectionId: assignment.sectionId || undefined,
    subjectId: assignment.subjectId || undefined
  };
}

function cleanAssignment(assignment: AssignmentDraft) {
  if (assignment.role === "HTPO") {
    return {
      campusId: assignment.campusId,
      programId: assignment.programId,
      branchId: assignment.branchId,
      role: assignment.role
    };
  }

  return {
    campusId: assignment.campusId,
    programId: assignment.programId,
    branchId: assignment.branchId,
    batchId: assignment.batchId,
    classId: assignment.classId,
    role: assignment.role,
    sectionId: assignment.sectionId || undefined,
    subjectId: assignment.subjectId || undefined
  };
}

function classLabel(item: AcademicClass) {
  return item.label || `Class ${item.yearNumber}`;
}

function selectedBranchOption(assignment: AssignmentDraft, data: TeacherData): [string, string][] {
  const branch = data.branches.find((item) => item.id === assignment.branchId);
  return branch ? [[branch.id, `${branch.code} - ${branch.name}`]] : [];
}

function validateAssignment(assignment: AssignmentDraft) {
  if (assignment.role === "HTPO") {
    if (!assignment.campusId || !assignment.programId || !assignment.branchId) return "Select campus, department, and HTPO branch.";
    return "";
  }

  if (!assignment.campusId || !assignment.programId || !assignment.branchId || !assignment.batchId || !assignment.semester || !assignment.classId) return "Complete required assignment fields.";
  if ((assignment.role === "CTPO" || assignment.role === "STPO") && !assignment.sectionId) return `${assignment.role} assignment requires a section.`;
  if (assignment.role === "STPO" && !assignment.subjectId) return "STPO assignment requires a subject.";
  return "";
}

function assignmentKey(assignment: AssignmentDraft) {
  if (assignment.role === "HTPO") return [assignment.campusId, assignment.programId, assignment.branchId, assignment.role].join("|");
  return [assignment.campusId, assignment.programId, assignment.branchId, assignment.batchId, assignment.semester, assignment.classId, assignment.role, assignment.sectionId ?? "", assignment.subjectId ?? ""].join("|");
}

function assignmentLabel(assignment: AssignmentDraft, data: TeacherData) {
  if (assignment.sectionId) {
    const sectionLabel = formatSectionAssignmentLabel(assignment, data);
    if (sectionLabel) return `${assignment.role}: ${sectionLabel}`;
  }
  if (assignment.subjectId) {
    const subjectLabel = formatSubjectAssignmentLabel(assignment, data);
    if (subjectLabel) return `${assignment.role}: ${subjectLabel}`;
  }

  const campus = data.campuses.find((item) => item.id === assignment.campusId)?.code;
  const program = data.programs.find((item) => item.id === assignment.programId)?.code;
  const branch = data.branches.find((item) => item.id === assignment.branchId)?.code;
  if (assignment.role === "HTPO") {
    return [campus, program, branch, "Branch-level HTPO"].filter(Boolean).join(" / ");
  }

  const batch = data.batches.find((item) => item.id === assignment.batchId);
  const classItem = data.classes.find((item) => item.id === assignment.classId);
  const section = data.sections.find((item) => item.id === assignment.sectionId)?.name;
  const subject = data.subjects.find((item) => item.id === assignment.subjectId)?.code;
  return [campus, program, branch, batch ? `${batch.startYear}-${batch.endYear}` : "", classItem ? `Sem ${classItem.semesterNumber}` : "", section, subject].filter(Boolean).join(" / ");
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

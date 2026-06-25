import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { todayIstDate, formatIstLocaleDate } from "../shared/ist-time";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { ModuleExportButton } from "../shared/export";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section, Subject } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";

type AttendanceStatus = "PRESENT" | "ABSENT";
type StudentRosterItem = { id: string; rollNumber: string; fullName: string };
type AttendanceSession = {
  id: string;
  date: string;
  structure: { campus: string; branch: string; semester: number; section: string; subject: string };
  markedBy: string;
  summary: { total: number; present: number; absent: number; percentage: number };
};
type CorrectionRequest = {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  requestedBy: { fullName: string };
  session: { section: { name: string }; subject?: { name: string } | null; class: { semesterNumber: number } };
};
type AttendanceHoliday = { id: string; holidayDate: string; title: string; campus: { code: string } };
type StudentSummary = {
  summary: { total: number; present: number; percentage: number };
  bySubject: { subject: string; total: number; present: number; percentage: number }[];
  recent: { id: string; date: string; subject: string; section: string; semester: number; status: AttendanceStatus }[];
};
type TeacherAssignmentOption = {
  id: string;
  role: "STPO" | "CTPO" | "HTPO";
  scopeLabel: string;
  campus?: { id: string } | null;
  department?: { id: string } | null;
  branch?: { id: string } | null;
  batch?: { id: string } | null;
  class?: { id: string } | null;
  section?: { id: string } | null;
  subject?: { id: string } | null;
};

const inputClass = "db-input";

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Attendance action failed.");
    }
    return (await response.json()) as T;
  }

  return { fetchJson, sendJson };
}

export function AdminAttendancePanel() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [holidays, setHolidays] = useState<AttendanceHoliday[]>([]);
  const [holidayForm, setHolidayForm] = useState({ campusId: "", holidayDate: todayIstDate(), title: "" });
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load() {
    const [pageData, correctionPage, holidayData, campusPage] = await Promise.all([
      fetchJson<PaginatedResponse<AttendanceSession>>(`/api/attendance?page=${page}&pageSize=25`),
      fetchJson<PaginatedResponse<CorrectionRequest>>("/api/attendance/correction-requests?pageSize=10"),
      fetchJson<AttendanceHoliday[]>("/api/attendance/holidays"),
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100")
    ]);
    setSessions(pageData.items);
    setTotal(pageData.total);
    setCorrections(correctionPage.items);
    setHolidays(holidayData);
    setCampuses(campusPage.items);
    setHolidayForm((current) => ({ ...current, campusId: current.campusId || campusPage.items[0]?.id || "" }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load attendance", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function createHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendJson("/api/attendance/holidays", holidayForm);
    setHolidayForm({ ...holidayForm, title: "" });
    await load();
    showToast("Holiday added");
  }

  async function reviewCorrection(id: string, action: "approve" | "reject") {
    await sendJson(`/api/attendance/correction-requests/${id}/${action}`, {});
    await load();
    showToast(`Correction ${action}d`);
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Attendance Monitor</h2>
          <p className="text-sm text-slate-500">Admin view of marked attendance sessions.</p>
        </div>
        <div className="flex gap-2">
          <ModuleExportButton apiPath="/api/attendance/export" pageName="Attendance" cardName="SessionExport" queryParams={{ pageSize: "100" }} />
          <SafeActionButton run={() => load().then(() => showToast("Attendance refreshed"))}>Refresh</SafeActionButton>
        </div>
      </div>
      <form className="erp-admin-form mb-4 grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void createHoliday(event)}>
        <SearchableSelect value={holidayForm.campusId} options={campuses.map((campus) => [campus.id, campus.code])} onChange={(campusId) => setHolidayForm({ ...holidayForm, campusId })} required />
        <input className={inputClass} type="date" value={holidayForm.holidayDate} onChange={(event) => setHolidayForm({ ...holidayForm, holidayDate: event.target.value })} required />
        <input className={inputClass} placeholder="Holiday title" value={holidayForm.title} onChange={(event) => setHolidayForm({ ...holidayForm, title: event.target.value })} required />
        <button className="erp-panel-submit">Add Holiday</button>
      </form>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <MiniList title="Pending Corrections">
          {corrections.length ? corrections.map((request) => (
            <div key={request.id} className="border-b px-4 py-3 text-sm">
              <p className="font-semibold">{request.requestedBy.fullName} / Sem {request.session.class.semesterNumber} / {request.session.section.name}</p>
              <p className="text-slate-500">{request.reason}</p>
              <div className="mt-2 flex gap-2">
                <button className="font-semibold text-green-700" onClick={() => void reviewCorrection(request.id, "approve")}>Approve</button>
                <button className="font-semibold text-red-600" onClick={() => void reviewCorrection(request.id, "reject")}>Reject</button>
              </div>
            </div>
          )) : <p className="px-4 py-3 text-sm text-slate-500">No pending corrections.</p>}
        </MiniList>
        <MiniList title="Attendance Holidays">
          {holidays.length ? holidays.map((holiday) => (
            <div key={holiday.id} className="border-b px-4 py-3 text-sm">{holiday.campus.code} / {formatIstLocaleDate(holiday.holidayDate)} / {holiday.title}</div>
          )) : <p className="px-4 py-3 text-sm text-slate-500">No holidays configured.</p>}
        </MiniList>
      </div>
      <SessionList sessions={sessions} />
      <Pager page={page} pageSize={25} total={total} onPage={setPage} />
    </section>
  );
}

export function TeacherAttendancePanel() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [roster, setRoster] = useState<StudentRosterItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [assignments, setAssignments] = useState<TeacherAssignmentOption[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [correctionSessionId, setCorrectionSessionId] = useState("");
  const [form, setForm] = useState({
    campusId: "",
    programId: "",
    branchId: "",
    batchId: "",
    classId: "",
    sectionId: "",
    subjectId: "",
    attendanceDate: todayIstDate()
  });

  const filteredPrograms = programsForOperationalCampus(programs, form.campusId, campuses);
  const filteredBranches = branches.filter((item) => item.programId === form.programId);
  const filteredBatches = batches.filter((item) => item.branchId === form.branchId);
  const filteredClasses = classes.filter((item) => item.batchId === form.batchId);
  const filteredSections = sections.filter((item) => item.classId === form.classId);
  const selectedClass = classes.find((item) => item.id === form.classId);
  const filteredSubjects = subjects.filter((item) => item.branchId === form.branchId && item.semesterNumber === selectedClass?.semesterNumber);

  const scope = useMemo(
    () => ({
      campusId: form.campusId,
      programId: form.programId,
      branchId: form.branchId,
      batchId: form.batchId,
      classId: form.classId,
      sectionId: form.sectionId,
      subjectId: form.subjectId || undefined
    }),
    [form]
  );

  async function loadStructure() {
    const [dashboard, structure] = await Promise.all([
      fetchJson<{ assignments: TeacherAssignmentOption[] }>("/api/portals/teacher/dashboard"),
      fetchJson<{
        campuses: Campus[];
        programs: Program[];
        branches: Branch[];
        batches: Batch[];
        classes: AcademicClass[];
        sections: Section[];
        subjects: Subject[];
      }>("/api/portals/teacher/structure")
    ]);
    setAssignments(dashboard.assignments);
    setCampuses(structure.campuses);
    setPrograms(structure.programs);
    setBranches(structure.branches);
    setBatches(structure.batches);
    setClasses(structure.classes);
    setSections(structure.sections);
    setSubjects(structure.subjects);
    const firstAssignment = dashboard.assignments[0];
    setForm((current) => ({
      ...current,
      campusId: current.campusId || firstAssignment?.campus?.id || "",
      programId: current.programId || firstAssignment?.department?.id || "",
      branchId: current.branchId || firstAssignment?.branch?.id || "",
      batchId: current.batchId || firstAssignment?.batch?.id || "",
      classId: current.classId || firstAssignment?.class?.id || "",
      sectionId: current.sectionId || firstAssignment?.section?.id || "",
      subjectId: current.subjectId || firstAssignment?.subject?.id || ""
    }));
    setAssignmentId((current) => current || firstAssignment?.id || "");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStructure().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load attendance structure", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRoster() {
    const result = await sendJson<{ students: StudentRosterItem[] }>("/api/attendance/roster", scope);
    setRoster(result.students);
    setStatuses(Object.fromEntries(result.students.map((student) => [student.id, "PRESENT" as AttendanceStatus])));
    showToast("Roster loaded");
  }

  async function markAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await sendJson("/api/attendance/mark", {
        scope,
        attendanceDate: form.attendanceDate,
        entries: roster.map((student) => ({ studentProfileId: student.id, status: statuses[student.id] ?? "ABSENT" }))
      });
      setRoster([]);
      setStatuses({});
      showToast("Attendance marked");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to mark attendance", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyAssignment(nextAssignmentId: string) {
    const assignment = assignments.find((item) => item.id === nextAssignmentId);
    setAssignmentId(nextAssignmentId);
    if (!assignment) return;
    setForm((current) => ({
      ...current,
      campusId: assignment.campus?.id ?? "",
      programId: assignment.department?.id ?? "",
      branchId: assignment.branch?.id ?? "",
      batchId: assignment.batch?.id ?? "",
      classId: assignment.class?.id ?? "",
      sectionId: assignment.section?.id ?? "",
      subjectId: assignment.subject?.id ?? ""
    }));
    setRoster([]);
    setStatuses({});
  }

  async function bulkMarkAttendance() {
    const parsed = JSON.parse(bulkText) as unknown;
    const sessions = Array.isArray(parsed) ? parsed : (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) throw new Error("Paste a JSON array of attendance sessions or { sessions: [...] }.");
    const result = await sendJson<{ marked: number; errors: { index: number; message: string }[] }>("/api/attendance/bulk", { sessions });
    showToast(`Bulk marked ${result.marked}, ${result.errors.length} failed`, result.errors.length ? "error" : "success");
  }

  async function requestCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = JSON.parse(correctionText) as unknown;
    if (!Array.isArray(entries)) throw new Error("Correction entries must be a JSON array.");
    await sendJson(`/api/attendance/${correctionSessionId}/correction-requests`, {
      reason: "Teacher requested attendance correction",
      entries
    });
    setCorrectionSessionId("");
    setCorrectionText("");
    showToast("Correction request submitted");
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Mark Attendance</h2>
      <p className="mb-4 text-sm text-slate-500">Select assigned scope, pick the date, load roster, then submit once per day. Duplicate day sessions are blocked by backend.</p>
      <form className="space-y-4" onSubmit={(event) => void markAttendance(event)}>
        <div className="grid gap-3 md:grid-cols-4">
          <Select value={assignmentId} items={assignments.map((item) => [item.id, `${item.role} - ${item.scopeLabel}`])} onChange={applyAssignment} />
          <Select value={form.campusId} items={campuses.map((item) => [item.id, item.code])} onChange={(campusId) => setForm({ ...form, campusId })} />
          <Select value={form.programId} items={filteredPrograms.map((item) => [item.id, item.code])} onChange={(programId) => setForm({ ...form, programId })} />
          <Select value={form.branchId} items={filteredBranches.map((item) => [item.id, item.code])} onChange={(branchId) => setForm({ ...form, branchId })} />
          <Select value={form.batchId} items={filteredBatches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => setForm({ ...form, batchId })} />
          <Select value={form.classId} items={filteredClasses.map((item) => [item.id, `Sem ${item.semesterNumber}`])} onChange={(classId) => setForm({ ...form, classId })} />
          <Select value={form.sectionId} items={filteredSections.map((item) => [item.id, item.name])} onChange={(sectionId) => setForm({ ...form, sectionId })} />
          <Select value={form.subjectId} items={[["", "General / CTPO"], ...filteredSubjects.map((item) => [item.id, `${item.code} - ${item.name}`])]} onChange={(subjectId) => setForm({ ...form, subjectId })} required={false} />
          <input className={inputClass} type="date" value={form.attendanceDate} onChange={(event) => setForm({ ...form, attendanceDate: event.target.value })} required />
        </div>
        <SafeActionButton run={loadRoster}>Load Roster</SafeActionButton>
        {roster.length ? (
          <div className="rounded-xl border">
            <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Students</div>
            {roster.map((student) => (
              <div key={student.id} className="grid gap-2 border-b px-4 py-3 text-sm md:grid-cols-4">
                <span>{student.rollNumber}</span>
                <span>{student.fullName}</span>
                <SearchableSelect value={statuses[student.id] ?? "ABSENT"} options={[["PRESENT", "Present"], ["ABSENT", "Absent"]]} onChange={(status) => setStatuses({ ...statuses, [student.id]: status as AttendanceStatus })} />
              </div>
            ))}
            <button className="erp-panel-submit m-4 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Attendance"}</button>
          </div>
        ) : null}
      </form>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-slate-50 p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">Bulk Attendance Import</h3>
          <textarea className={`${inputClass} min-h-24`} placeholder='Paste JSON: [{"scope":{...},"attendanceDate":"2026-05-08","entries":[...]}]' value={bulkText} onChange={(event) => setBulkText(event.target.value)} />
          <SafeActionButton run={bulkMarkAttendance}>Bulk Mark</SafeActionButton>
        </div>
        <form className="rounded-xl border bg-slate-50 p-4" onSubmit={(event) => void requestCorrection(event)}>
          <h3 className="mb-2 text-sm font-bold text-slate-700">Request Attendance Correction</h3>
          <input className={inputClass} placeholder="Attendance session ID" value={correctionSessionId} onChange={(event) => setCorrectionSessionId(event.target.value)} required />
          <textarea className={`${inputClass} mt-2 min-h-24`} placeholder='Entries JSON: [{"studentProfileId":"...","status":"PRESENT"}]' value={correctionText} onChange={(event) => setCorrectionText(event.target.value)} required />
          <button className="erp-panel-submit mt-2">Submit Correction</button>
        </form>
      </div>
    </section>
  );
}

export function StudentAttendancePanel() {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentSummary | null>(null);

  async function load() {
    setData(await fetchJson<StudentSummary>("/api/attendance/me"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load attendance", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">My Attendance</h2>
          <p className="text-sm text-slate-500">Personal attendance percentage and recent history.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Attendance refreshed"))}>Refresh</SafeActionButton>
      </div>
      {data ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-blue-700">Overall Attendance</p>
            <p className="text-3xl font-bold text-blue-950">{data.summary.percentage}%</p>
            <p className="text-sm text-blue-800">{data.summary.present}/{data.summary.total} present</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.bySubject.map((item) => (
              <div key={item.subject} className="rounded-xl border p-4 text-sm">
                <p className="font-bold text-slate-800">{item.subject}</p>
                <p className="text-slate-500">{item.percentage}% / {item.present} of {item.total}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={item.percentage >= 75 ? "h-full bg-green-500" : "h-full bg-red-500"} style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border">
            <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold">Recent</div>
            {data.recent.map((item) => (
              <div key={item.id} className="grid gap-2 border-b px-4 py-3 text-sm md:grid-cols-4">
                <span>{formatIstLocaleDate(item.date)}</span>
                <span>{item.subject}</span>
                <span>Sem {item.semester} / {item.section}</span>
                <span className={item.status === "PRESENT" ? "font-bold text-green-700" : "font-bold text-red-600"}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No attendance yet.</p>}
    </section>
  );
}

function SessionList({ sessions }: { sessions: AttendanceSession[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Sessions</div>
      {sessions.length ? sessions.map((session) => (
        <div key={session.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-700 md:grid-cols-6">
          <span>{formatIstLocaleDate(session.date)}</span>
          <span>{session.structure.campus} / {session.structure.branch}</span>
          <span>Sem {session.structure.semester} / {session.structure.section}</span>
          <span>{session.structure.subject}</span>
          <span>{session.summary.present}/{session.summary.total} present</span>
          <span>{session.summary.percentage}%</span>
        </div>
      )) : <p className="px-4 py-6 text-sm text-slate-500">No attendance sessions yet.</p>}
    </div>
  );
}

function MiniList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{title}</div>
      {children}
    </div>
  );
}

function Select({ value, items, onChange, required = true }: { value: string; items: string[][]; onChange: (value: string) => void; required?: boolean }) {
  return (
    <SearchableSelect value={value} options={items.map(([id, label]) => [id, label])} onChange={onChange} required={required} clearable={!required} searchable={false} />
  );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm">
      <span>Page {page} of {maxPage}</span>
      <div className="flex gap-2">
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

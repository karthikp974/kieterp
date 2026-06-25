import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { ModuleExportButton } from "../shared/export";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { AcademicClass, Batch, Branch, Campus, PaginatedResponse, Program, Section, Subject } from "../structure/structure-types";
import { programsForOperationalCampus } from "../shared/academic-catalog";

type TeacherListItem = { id: string; identity: { fullName: string; employeeCode: string } };
type TimetableSlot = {
  id: string;
  dayOfWeek: number;
  time: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  structure: { campusId: string; programId: string; branchId: string; batchId: string; classId: string; sectionId: string; subjectId?: string | null; campus: string; branch: string; semester: number; section: string; subject: string };
  teacherProfileId?: string | null;
  teacher: string;
};

const inputClass = "db-input";
const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown, method = "POST") {
    const response = await authFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Timetable action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return { fetchJson, sendJson };
}

export function AdminTimetablePanel() {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({
    campusId: "",
    programId: "",
    branchId: "",
    batchId: "",
    classId: "",
    sectionId: "",
    subjectId: "",
    teacherProfileId: "",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    room: ""
  });

  const filteredPrograms = programsForOperationalCampus(programs, form.campusId, campuses);
  const filteredBranches = branches.filter((item) => item.programId === form.programId);
  const filteredBatches = batches.filter((item) => item.branchId === form.branchId);
  const filteredClasses = classes.filter((item) => item.batchId === form.batchId);
  const filteredSections = sections.filter((item) => item.classId === form.classId);
  const selectedClass = classes.find((item) => item.id === form.classId);
  const filteredSubjects = subjects.filter((item) => item.branchId === form.branchId && item.semesterNumber === selectedClass?.semesterNumber);

  async function load() {
    const [slotPage, campusPage, programPage, branchPage, batchPage, classPage, sectionPage, subjectPage, teacherPage] = await Promise.all([
      fetchJson<PaginatedResponse<TimetableSlot>>(`/api/timetable?page=${page}&pageSize=25`),
      fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
      fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
      fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
      fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
      fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
      fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100"),
      fetchJson<PaginatedResponse<Subject>>("/api/core/subjects?pageSize=100"),
      fetchJson<PaginatedResponse<TeacherListItem>>("/api/teachers?pageSize=100")
    ]);
    setSlots(slotPage.items);
    setTotal(slotPage.total);
    setCampuses(campusPage.items);
    setPrograms(programPage.items);
    setBranches(branchPage.items);
    setBatches(batchPage.items);
    setClasses(classPage.items);
    setSections(sectionPage.items);
    setSubjects(subjectPage.items);
    setTeachers(teacherPage.items);
    setForm((current) => ({
      ...current,
      campusId: current.campusId || campusPage.items[0]?.id || "",
      programId: current.programId || programPage.items[0]?.id || "",
      branchId: current.branchId || branchPage.items[0]?.id || "",
      batchId: current.batchId || batchPage.items[0]?.id || "",
      classId: current.classId || classPage.items[0]?.id || "",
      sectionId: current.sectionId || sectionPage.items[0]?.id || "",
      subjectId: current.subjectId || subjectPage.items[0]?.id || "",
      teacherProfileId: current.teacherProfileId || teacherPage.items[0]?.id || ""
    }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load timetable", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      subjectId: form.subjectId || undefined,
      teacherProfileId: form.teacherProfileId || undefined,
      room: form.room || undefined
    };
    if (editingSlotId) {
      await sendJson(`/api/timetable/${editingSlotId}`, {
        subjectId: payload.subjectId,
        teacherProfileId: payload.teacherProfileId,
        dayOfWeek: payload.dayOfWeek,
        startTime: payload.startTime,
        endTime: payload.endTime,
        room: payload.room
      }, "PATCH");
      setEditingSlotId(null);
      showToast("Timetable slot updated");
    } else {
      await sendJson("/api/timetable", payload);
      showToast("Timetable slot created");
    }
    await load();
  }

  async function archiveSlot(id: string) {
    await sendJson(`/api/timetable/${id}/archive`, {});
    await load();
    showToast("Timetable slot archived");
  }

  function editSlot(slot: TimetableSlot) {
    setEditingSlotId(slot.id);
    setForm({
      campusId: slot.structure.campusId,
      programId: slot.structure.programId,
      branchId: slot.structure.branchId,
      batchId: slot.structure.batchId,
      classId: slot.structure.classId,
      sectionId: slot.structure.sectionId,
      subjectId: slot.structure.subjectId ?? "",
      teacherProfileId: slot.teacherProfileId ?? "",
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room ?? ""
    });
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Timetable Management</h2>
          <p className="text-sm text-slate-500">Create class/section slots with teacher conflict prevention.</p>
        </div>
        <div className="flex gap-2">
          <ModuleExportButton apiPath="/api/timetable/export" pageName="Timetable" cardName="SectionSchedule" queryParams={{ pageSize: "100" }} />
          <SafeActionButton run={() => load().then(() => showToast("Timetable refreshed"))}>Refresh</SafeActionButton>
        </div>
      </div>
      <form className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void createSlot(event)}>
        <Select value={form.campusId} items={campuses.map((item) => [item.id, item.code])} onChange={(campusId) => setForm({ ...form, campusId })} />
        <Select value={form.programId} items={filteredPrograms.map((item) => [item.id, item.code])} onChange={(programId) => setForm({ ...form, programId })} />
        <Select value={form.branchId} items={filteredBranches.map((item) => [item.id, item.code])} onChange={(branchId) => setForm({ ...form, branchId })} />
        <Select value={form.batchId} items={filteredBatches.map((item) => [item.id, `${item.startYear}-${item.endYear}`])} onChange={(batchId) => setForm({ ...form, batchId })} />
        <Select value={form.classId} items={filteredClasses.map((item) => [item.id, `Sem ${item.semesterNumber}`])} onChange={(classId) => setForm({ ...form, classId })} />
        <Select value={form.sectionId} items={filteredSections.map((item) => [item.id, item.name])} onChange={(sectionId) => setForm({ ...form, sectionId })} />
        <Select value={form.subjectId} items={[["", "General"], ...filteredSubjects.map((item) => [item.id, `${item.code} - ${item.name}`])]} onChange={(subjectId) => setForm({ ...form, subjectId })} required={false} />
        <Select value={form.teacherProfileId} items={[["", "Unassigned"], ...teachers.map((item) => [item.id, `${item.identity.employeeCode} - ${item.identity.fullName}`])]} onChange={(teacherProfileId) => setForm({ ...form, teacherProfileId })} required={false} />
        <SearchableSelect value={String(form.dayOfWeek)} options={days.slice(1).map((day, index) => [String(index + 1), day])} onChange={(dayOfWeek) => setForm({ ...form, dayOfWeek: Number(dayOfWeek) })} />
        <input className={inputClass} type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required />
        <input className={inputClass} type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required />
        <input className={inputClass} placeholder="Room" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} />
        <button className="erp-panel-submit md:col-span-2">{editingSlotId ? "Update Timetable Slot" : "Add Timetable Slot"}</button>
        {editingSlotId ? <button type="button" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 md:col-span-2" onClick={() => setEditingSlotId(null)}>Cancel Edit</button> : null}
      </form>
      <TimetableList slots={slots} onArchive={archiveSlot} onEdit={editSlot} />
      <Pager page={page} pageSize={25} total={total} onPage={setPage} />
    </section>
  );
}

export function TeacherTimetablePanel() {
  return <SelfTimetablePanel title="My Teaching Timetable" endpoint="/api/timetable/teacher/me" />;
}

export function StudentTimetablePanel() {
  return <SelfTimetablePanel title="My Class Timetable" endpoint="/api/timetable/me" />;
}

function SelfTimetablePanel({ title, endpoint }: { title: string; endpoint: string }) {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const groupedSlots = days.slice(1).map((day, index) => ({ day, dayOfWeek: index + 1, slots: slots.filter((slot) => slot.dayOfWeek === index + 1) }));

  async function load() {
    const result = await fetchJson<{ items: TimetableSlot[] }>(endpoint);
    setSlots(result.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load timetable", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">Weekly timetable grouped by day and time.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Timetable refreshed"))}>Refresh</SafeActionButton>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {groupedSlots.map((group) => (
          <div key={group.day} className="rounded-xl border bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">{group.day}</h3>
            {group.slots.map((slot) => (
              <article key={slot.id} className="mb-3 rounded-xl border bg-white p-3 text-sm last:mb-0">
                <p className="font-extrabold text-slate-950">{slot.time} / {slot.structure.section}</p>
                <p className="text-slate-600">{slot.structure.subject}</p>
                <p className="text-xs font-semibold text-slate-500">{slot.structure.branch} / Sem {slot.structure.semester}{slot.room ? ` / Room ${slot.room}` : ""}</p>
              </article>
            ))}
            {!group.slots.length ? <p className="text-sm text-slate-500">No classes.</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function TimetableList({ slots, onArchive, onEdit }: { slots: TimetableSlot[]; onArchive?: (id: string) => Promise<void>; onEdit?: (slot: TimetableSlot) => void }) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border">
      <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">Slots</div>
      {slots.length ? slots.map((slot) => (
        <div key={slot.id} className="grid gap-2 border-b px-4 py-3 text-sm text-slate-700 md:grid-cols-9">
          <span>{days[slot.dayOfWeek]}</span>
          <span>{slot.time}</span>
          <span>{slot.structure.branch}</span>
          <span>Sem {slot.structure.semester} / {slot.structure.section}</span>
          <span>{slot.structure.subject}</span>
          <span>{slot.teacher}</span>
          <span>{slot.room ?? "-"}</span>
          {onEdit ? <button className="text-left font-semibold text-blue-700" onClick={() => onEdit(slot)}>Edit</button> : null}
          {onArchive ? <button className="text-left font-semibold text-amber-700" onClick={() => void onArchive(slot.id)}>Archive</button> : null}
        </div>
      )) : <p className="px-4 py-6 text-sm text-slate-500">No timetable slots yet.</p>}
    </div>
  );
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm">
      <span>Page {page} of {maxPage} / {total} slots</span>
      <div className="flex gap-2">
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="rounded-lg bg-slate-100 px-3 py-2 font-semibold disabled:opacity-50" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function Select({ value, items, onChange, required = true }: { value: string; items: string[][]; onChange: (value: string) => void; required?: boolean }) {
  return (
    <SearchableSelect value={value} options={items.map(([id, label]) => [id, label])} onChange={onChange} required={required} clearable={!required} searchable={false} />
  );
}

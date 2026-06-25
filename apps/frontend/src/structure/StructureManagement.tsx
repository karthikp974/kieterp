import { FormEvent, ReactElement, useEffect, useMemo, useState } from "react";
import { istYear } from "../shared/ist-time";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { SearchableSelect } from "../shared/SearchableSelect";
import { Trash2 } from "lucide-react";
import { useConfirm } from "../shared/ConfirmDialog";
import { useToast } from "../shared/toast-context";
import { programsForOperationalCampus } from "../shared/academic-catalog";
import {
  AcademicClass,
  Batch,
  Branch,
  Campus,
  CampusGroup,
  PaginatedResponse,
  Program,
  Section,
  Subject
} from "./structure-types";

type StructureTab = "campuses" | "programs" | "branches" | "batches" | "classes" | "sections" | "subjects";

const tabs: { id: StructureTab; label: string }[] = [
  { id: "campuses", label: "Campuses" },
  { id: "programs", label: "Programs" },
  { id: "branches", label: "Branches" },
  { id: "batches", label: "Batches" },
  { id: "classes", label: "Classes" },
  { id: "sections", label: "Sections" },
  { id: "subjects", label: "Subjects" }
];

const inputClass = "db-input";

type StructureRow = {
  id: string;
  cells: string[];
  archivePath: string;
};

type StructureManagementProps = {
  initialTab?: StructureTab;
  visibleTabs?: StructureTab[];
  title?: string;
  description?: string;
};

export function StructureManagement({
  initialTab = "campuses",
  visibleTabs,
  title = "Structure Management",
  description = "Manage Campus to Program to Branch to Batch to Class to Section."
}: StructureManagementProps = {}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [activeTab, setActiveTab] = useState<StructureTab>(initialTab);
  const [campusGroups, setCampusGroups] = useState<CampusGroup[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [campusForm, setCampusForm] = useState({ code: "", name: "", groupId: "" });
  const [programForm, setProgramForm] = useState({ campusId: "", code: "", name: "", durationValue: 4, semesters: 8 });
  const [branchForm, setBranchForm] = useState({ programId: "", code: "", name: "" });
  const [batchForm, setBatchForm] = useState({ branchId: "", startYear: istYear(new Date()), endYear: istYear(new Date()) + 4 });
  const [classForm, setClassForm] = useState({ batchId: "", yearNumber: 1, semesterNumber: 1, label: "1st Year / Sem 1" });
  const [sectionForm, setSectionForm] = useState({ classId: "", name: "A", capacity: 60 });
  const [subjectForm, setSubjectForm] = useState({ branchId: "", code: "", name: "", semesterNumber: 1 });
  const [generationForm, setGenerationForm] = useState({ batchId: "", sectionNames: "A,B,C", sectionCapacity: 60 });

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) {
      throw new Error(`Request failed: ${path}`);
    }
    return (await response.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Action failed.");
    }

    return (await response.json()) as T;
  }

  async function archiveRecord(path: string) {
    const ok = await confirm({
      title: "Archive record?",
      message: "Existing linked data stays safe, but it will be hidden from future selections.",
      confirmLabel: "Archive",
      icon: Trash2
    });
    if (!ok) return;

    await postJson(path, {});
    await loadStructure();
    showToast("Record archived");
  }

  async function loadStructure() {
    setIsLoading(true);
    try {
      const [groups, campusPage, programPage, branchPage, batchPage, classPage, sectionPage, subjectPage] = await Promise.all([
        fetchJson<CampusGroup[]>("/api/core/campus-groups"),
        fetchJson<PaginatedResponse<Campus>>("/api/campuses?pageSize=100"),
        fetchJson<PaginatedResponse<Program>>("/api/core/programs?pageSize=100"),
        fetchJson<PaginatedResponse<Branch>>("/api/core/branches?pageSize=100"),
        fetchJson<PaginatedResponse<Batch>>("/api/core/batches?pageSize=100"),
        fetchJson<PaginatedResponse<AcademicClass>>("/api/core/classes?pageSize=100"),
        fetchJson<PaginatedResponse<Section>>("/api/core/sections?pageSize=100"),
        fetchJson<PaginatedResponse<Subject>>("/api/core/subjects?pageSize=100")
      ]);

      setCampusGroups(groups);
      setCampuses(campusPage.items);
      setPrograms(programPage.items);
      setBranches(branchPage.items);
      setBatches(batchPage.items);
      setClasses(classPage.items);
      setSections(sectionPage.items);
      setSubjects(subjectPage.items);
      setCampusForm((current) => ({ ...current, groupId: current.groupId || groups[0]?.id || "" }));
      setProgramForm((current) => ({ ...current, campusId: current.campusId || campusPage.items[0]?.id || "" }));
      setBranchForm((current) => ({ ...current, programId: current.programId || programPage.items[0]?.id || "" }));
      setBatchForm((current) => ({ ...current, branchId: current.branchId || branchPage.items[0]?.id || "" }));
      setClassForm((current) => ({ ...current, batchId: current.batchId || batchPage.items[0]?.id || "" }));
      setSectionForm((current) => ({ ...current, classId: current.classId || classPage.items[0]?.id || "" }));
      setSubjectForm((current) => ({ ...current, branchId: current.branchId || branchPage.items[0]?.id || "" }));
      setGenerationForm((current) => ({ ...current, batchId: current.batchId || batchPage.items[0]?.id || "" }));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStructure().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load structure", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, action: () => Promise<void>) {
    event.preventDefault();
    await action();
  }

  const activeCount = useMemo(
    () => ({
      campuses: campuses.length,
      programs: programs.length,
      branches: branches.length,
      batches: batches.length,
      classes: classes.length,
      sections: sections.length,
      subjects: subjects.length
    }),
    [batches.length, branches.length, campuses.length, classes.length, programs.length, sections.length, subjects.length]
  );
  const visibleStructureTabs = useMemo(
    () => tabs.filter((tab) => !visibleTabs || visibleTabs.includes(tab.id)),
    [visibleTabs]
  );

  const branchProgramOptions = useMemo(
    () =>
      programsForOperationalCampus(programs, programForm.campusId || campuses[0]?.id || "", campuses).map((program) => [
        program.id,
        `${program.campus?.code ?? "-"} / ${program.code}`
      ] as [string, string]),
    [programs, programForm.campusId, campuses]
  );

  useEffect(() => {
    if (!visibleStructureTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleStructureTabs[0]?.id ?? initialTab);
    }
  }, [activeTab, initialTab, visibleStructureTabs]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <SafeActionButton run={() => loadStructure().then(() => showToast("Structure refreshed"))} busyLabel="Refreshing...">
          Refresh
        </SafeActionButton>
      </div>

      {visibleStructureTabs.length > 1 ? (
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {visibleStructureTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
              activeTab === tab.id ? "erp-admin-tab-active" : "erp-admin-tab-idle"
            }`}
          >
            {tab.label} ({activeCount[tab.id]})
          </button>
        ))}
      </div>
      ) : null}

      {isLoading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading structure...</p> : null}

      {!isLoading && activeTab === "campuses" ? (
        <StructurePanel
          title="Campuses"
          form={
            <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void submit(event, createCampus)}>
              <input className={inputClass} placeholder="Code" value={campusForm.code} onChange={(event) => setCampusForm({ ...campusForm, code: event.target.value })} required />
              <input className={inputClass} placeholder="Name" value={campusForm.name} onChange={(event) => setCampusForm({ ...campusForm, name: event.target.value })} required />
              <SearchableSelect value={campusForm.groupId} options={campusGroups.map((group) => [group.id, group.name])} onChange={(groupId) => setCampusForm({ ...campusForm, groupId })} required />
              <button className="erp-panel-submit">Add Campus</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={campuses.map((campus) => ({
            id: campus.id,
            archivePath: `/api/core/campuses/${campus.id}/archive`,
            cells: [campus.code, campus.name, campus.group?.name ?? "-"]
          }))}
        />
      ) : null}

      {!isLoading && activeTab === "programs" ? (
        <StructurePanel
          title="Programs"
          form={
            <form className="grid gap-3 md:grid-cols-6" onSubmit={(event) => void submit(event, createProgram)}>
              <SearchableSelect value={programForm.campusId} options={campuses.map((campus) => [campus.id, campus.code])} onChange={(campusId) => setProgramForm({ ...programForm, campusId })} required />
              <input className={inputClass} placeholder="Code" value={programForm.code} onChange={(event) => setProgramForm({ ...programForm, code: event.target.value })} required />
              <input className={inputClass} placeholder="Name" value={programForm.name} onChange={(event) => setProgramForm({ ...programForm, name: event.target.value })} required />
              <input className={inputClass} type="number" min={1} value={programForm.durationValue} onChange={(event) => setProgramForm({ ...programForm, durationValue: Number(event.target.value) })} required />
              <input className={inputClass} type="number" min={1} value={programForm.semesters} onChange={(event) => setProgramForm({ ...programForm, semesters: Number(event.target.value) })} required />
              <button className="erp-panel-submit">Add Program</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={programs.map((program) => ({
            id: program.id,
            archivePath: `/api/core/programs/${program.id}/archive`,
            cells: [program.campus?.code ?? "-", program.code, program.name, `${program.durationValue} years`, `${program.semesters} sems`]
          }))}
        />
      ) : null}

      {!isLoading && activeTab === "branches" ? (
        <StructurePanel
          title="Branches"
          form={
            <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void submit(event, createBranch)}>
              <SearchableSelect value={branchForm.programId} options={branchProgramOptions} onChange={(programId) => setBranchForm({ ...branchForm, programId })} required />
              <input className={inputClass} placeholder="Code" value={branchForm.code} onChange={(event) => setBranchForm({ ...branchForm, code: event.target.value })} required />
              <input className={inputClass} placeholder="Name" value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} required />
              <button className="erp-panel-submit">Add Branch</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={branches.map((branch) => ({
            id: branch.id,
            archivePath: `/api/core/branches/${branch.id}/archive`,
            cells: [branch.program?.campus?.code ?? "-", branch.program?.code ?? "-", branch.code, branch.name]
          }))}
        />
      ) : null}

      {!isLoading && activeTab === "batches" ? (
        <div className="space-y-5">
          <StructurePanel
            title="Batches"
            form={
              <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void submit(event, createBatch)}>
                <SearchableSelect value={batchForm.branchId} options={branches.map((branch) => [branch.id, `${branch.program?.campus?.code} / ${branch.program?.code} / ${branch.code}`])} onChange={(branchId) => setBatchForm({ ...batchForm, branchId })} required />
                <input className={inputClass} type="number" value={batchForm.startYear} onChange={(event) => setBatchForm({ ...batchForm, startYear: Number(event.target.value) })} required />
                <input className={inputClass} type="number" value={batchForm.endYear} onChange={(event) => setBatchForm({ ...batchForm, endYear: Number(event.target.value) })} required />
                <button className="erp-panel-submit">Add Batch</button>
              </form>
            }
            onArchive={archiveRecord}
            rows={batches.map((batch) => ({
              id: batch.id,
              archivePath: `/api/core/batches/${batch.id}/archive`,
              cells: [batch.branch?.program?.campus?.code ?? "-", batch.branch?.program?.code ?? "-", batch.branch?.code ?? "-", `${batch.startYear}-${batch.endYear}`]
            }))}
          />
          <div className="rounded-xl border bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Generate Classes and Sections</h3>
            <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void submit(event, generateClasses)}>
              <SearchableSelect value={generationForm.batchId} options={batches.map((batch) => [batch.id, `${batch.branch?.code} / ${batch.startYear}-${batch.endYear}`])} onChange={(batchId) => setGenerationForm({ ...generationForm, batchId })} required />
              <input className={inputClass} placeholder="Sections e.g. A,B,C" value={generationForm.sectionNames} onChange={(event) => setGenerationForm({ ...generationForm, sectionNames: event.target.value })} />
              <input className={inputClass} type="number" min={1} value={generationForm.sectionCapacity} onChange={(event) => setGenerationForm({ ...generationForm, sectionCapacity: Number(event.target.value) })} />
              <button className="erp-panel-submit">Generate</button>
            </form>
          </div>
        </div>
      ) : null}

      {!isLoading && activeTab === "classes" ? (
        <StructurePanel
          title="Classes"
          form={
            <form className="grid gap-3 md:grid-cols-5" onSubmit={(event) => void submit(event, createClass)}>
              <SearchableSelect value={classForm.batchId} options={batches.map((batch) => [batch.id, `${batch.branch?.code} / ${batch.startYear}-${batch.endYear}`])} onChange={(batchId) => setClassForm({ ...classForm, batchId })} required />
              <input className={inputClass} type="number" min={1} value={classForm.yearNumber} onChange={(event) => setClassForm({ ...classForm, yearNumber: Number(event.target.value) })} required />
              <input className={inputClass} type="number" min={1} value={classForm.semesterNumber} onChange={(event) => setClassForm({ ...classForm, semesterNumber: Number(event.target.value) })} required />
              <input className={inputClass} value={classForm.label} onChange={(event) => setClassForm({ ...classForm, label: event.target.value })} required />
              <button className="erp-panel-submit">Add Class</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={classes.map((item) => ({
            id: item.id,
            archivePath: `/api/core/classes/${item.id}/archive`,
            cells: [item.batch?.branch?.code ?? "-", `${item.batch?.startYear}-${item.batch?.endYear}`, `Year ${item.yearNumber}`, `Sem ${item.semesterNumber}`, item.label]
          }))}
        />
      ) : null}

      {!isLoading && activeTab === "sections" ? (
        <StructurePanel
          title="Sections"
          form={
            <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void submit(event, createSection)}>
              <SearchableSelect value={sectionForm.classId} options={classes.map((item) => [item.id, `${item.batch?.branch?.code} / Sem ${item.semesterNumber}`])} onChange={(classId) => setSectionForm({ ...sectionForm, classId })} required />
              <input className={inputClass} value={sectionForm.name} onChange={(event) => setSectionForm({ ...sectionForm, name: event.target.value })} required />
              <input className={inputClass} type="number" min={1} value={sectionForm.capacity} onChange={(event) => setSectionForm({ ...sectionForm, capacity: Number(event.target.value) })} />
              <button className="erp-panel-submit">Add Section</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={sections.map((section) => ({
            id: section.id,
            archivePath: `/api/core/sections/${section.id}/archive`,
            cells: [section.class?.batch?.branch?.code ?? "-", `Sem ${section.class?.semesterNumber ?? "-"}`, section.name, section.capacity?.toString() ?? "-"]
          }))}
        />
      ) : null}

      {!isLoading && activeTab === "subjects" ? (
        <StructurePanel
          title="Subjects"
          form={
            <form className="grid gap-3 md:grid-cols-5" onSubmit={(event) => void submit(event, createSubject)}>
              <SearchableSelect value={subjectForm.branchId} options={branches.map((branch) => [branch.id, `${branch.program?.campus?.code} / ${branch.program?.code} / ${branch.code}`])} onChange={(branchId) => setSubjectForm({ ...subjectForm, branchId })} required />
              <input className={inputClass} placeholder="Code" value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })} required />
              <input className={inputClass} placeholder="Subject name" value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} required />
              <input className={inputClass} type="number" min={1} value={subjectForm.semesterNumber} onChange={(event) => setSubjectForm({ ...subjectForm, semesterNumber: Number(event.target.value) })} required />
              <button className="erp-panel-submit">Add Subject</button>
            </form>
          }
          onArchive={archiveRecord}
          rows={subjects.map((subject) => ({
            id: subject.id,
            archivePath: `/api/core/subjects/${subject.id}/archive`,
            cells: [subject.branch?.program?.campus?.code ?? "-", subject.branch?.code ?? "-", `Sem ${subject.semesterNumber}`, subject.code, subject.name]
          }))}
        />
      ) : null}
      {dialog}
    </section>
  );

  async function createCampus() {
    await postJson("/api/core/campuses", campusForm);
    setCampusForm({ code: "", name: "", groupId: campusForm.groupId });
    await loadStructure();
    showToast("Campus created");
  }

  async function createProgram() {
    await postJson("/api/core/programs", programForm);
    setProgramForm({ ...programForm, code: "", name: "" });
    await loadStructure();
    showToast("Program created");
  }

  async function createBranch() {
    await postJson("/api/core/branches", branchForm);
    setBranchForm({ ...branchForm, code: "", name: "" });
    await loadStructure();
    showToast("Branch created");
  }

  async function createBatch() {
    await postJson("/api/core/batches", batchForm);
    await loadStructure();
    showToast("Batch created");
  }

  async function generateClasses() {
    const sectionNames = generationForm.sectionNames
      .split(",")
      .map((section) => section.trim())
      .filter(Boolean);
    await postJson(`/api/core/batches/${generationForm.batchId}/generate-classes`, {
      sectionNames,
      sectionCapacity: generationForm.sectionCapacity
    });
    await loadStructure();
    showToast("Classes and sections generated");
  }

  async function createClass() {
    await postJson("/api/core/classes", classForm);
    await loadStructure();
    showToast("Class created");
  }

  async function createSection() {
    await postJson("/api/core/sections", sectionForm);
    await loadStructure();
    showToast("Section created");
  }

  async function createSubject() {
    await postJson("/api/core/subjects", subjectForm);
    setSubjectForm({ ...subjectForm, code: "", name: "" });
    await loadStructure();
    showToast("Subject created");
  }
}

function StructurePanel({
  title,
  form,
  rows,
  onArchive
}: {
  title: string;
  form: ReactElement;
  rows: StructureRow[];
  onArchive: (path: string) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-slate-50 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Add {title.slice(0, -1)}</h3>
        {form}
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{title}</div>
        <div className="divide-y">
          {rows.length ? (
            rows.map((row) => (
              <div key={row.id} className="grid gap-2 px-4 py-3 text-sm text-slate-700 md:grid-cols-6">
                {row.cells.map((cell, cellIndex) => (
                  <span key={`${row.id}-${cellIndex}`} className="truncate">{cell}</span>
                ))}
                <button type="button" className="text-left font-semibold text-amber-700" onClick={() => void onArchive(row.archivePath)}>
                  Archive
                </button>
              </div>
            ))
          ) : (
            <p className="px-4 py-6 text-sm text-slate-500">No records yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { ModuleExportButton } from "../shared/export";
import { SearchableSelect } from "../shared/SearchableSelect";
import { FilePickerTrigger } from "../shared/FilePickerSheet";
import { useToast } from "../shared/toast-context";
import { PaginatedResponse, Subject } from "../structure/structure-types";

type ResultStatus = "PASS" | "FAIL" | "ABSENT" | "WITHHELD";
type ResultEntry = {
  id: string;
  semesterNumber: number;
  examType: string;
  internals: number | null;
  externals: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number | null;
  status: ResultStatus;
  student: { id: string; rollNumber: string; fullName: string };
  subject: { id: string; code: string; name: string };
  updatedAt: string;
};
type StudentItem = {
  id: string;
  identity: { rollNumber: string; fullName: string };
  structure: { branchId: string; semesterNumber: number; sectionId: string; section: string };
};
type ResultsOptions = { students: StudentItem[]; subjects: Subject[] };
type ResultSummary = {
  summary: { totalSubjects: number; passed: number; failed: number; creditsEarned: number };
  failedSubjects: ResultEntry[];
  results: ResultEntry[];
};
type ImportJob = {
  id: string;
  status: string;
  payload: { originalName?: string; examType?: string };
  result?: { parsed?: number; imported?: number; skipped?: number; errors?: string[] } | null;
  error?: string | null;
  createdAt: string;
};

const inputClass = "db-input";
const statuses: ResultStatus[] = ["PASS", "FAIL", "ABSENT", "WITHHELD"];

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Result action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  async function sendForm<T>(path: string, body: FormData) {
    const response = await authFetch(path, { method: "POST", body });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Result upload failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return { fetchJson, sendJson, sendForm };
}

export function AdminResultsPanel() {
  return <ResultsEntryPanel title="Results Management" description="Enter or update semester results and export recent result entries." />;
}

export function TeacherResultsPanel() {
  return (
    <ResultsEntryPanel
      title="Result Entry Workspace"
      description="HTPO-scoped users can enter results; other teacher scopes can view allowed result data."
      teacherScoped
    />
  );
}

function ResultsEntryPanel({ title, description, teacherScoped = false }: { title: string; description: string; teacherScoped?: boolean }) {
  const { fetchJson, sendJson, sendForm } = useApi();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    studentProfileId: "",
    subjectId: "",
    semesterNumber: 1,
    examType: "SEMESTER",
    internals: 0,
    externals: 0,
    grade: "",
    credits: 0,
    status: "PASS" as ResultStatus
  });
  const selectedStudent = students.find((item) => item.id === form.studentProfileId);
  const filteredSubjects = selectedStudent
    ? subjects.filter((item) => item.branchId === selectedStudent.structure.branchId && item.semesterNumber === selectedStudent.structure.semesterNumber)
    : subjects;

  async function load() {
    const options = await fetchJson<ResultsOptions>("/api/results/options");
    const resultParams = new URLSearchParams({ pageSize: "25" });
    if (teacherScoped) {
      const sectionId = options.students[0]?.structure.sectionId ?? "";
      if (sectionId) resultParams.set("sectionId", sectionId);
    }
    const resultPage = await fetchJson<PaginatedResponse<ResultEntry>>(`/api/results?${resultParams.toString()}`).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25
    }));
    const importPage = await fetchJson<PaginatedResponse<ImportJob>>("/api/results/imports?pageSize=5").catch(() => ({ items: [], total: 0, page: 1, pageSize: 5 }));
    setStudents(options.students);
    setSubjects(options.subjects);
    setResults(resultPage.items);
    setImportJobs(importPage.items);
    setForm((current) => ({
      ...current,
      studentProfileId: current.studentProfileId || options.students[0]?.id || "",
      subjectId: current.subjectId || options.subjects[0]?.id || "",
      semesterNumber: current.semesterNumber || options.subjects[0]?.semesterNumber || 1
    }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load results", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedSubject = filteredSubjects.find((item) => item.id === form.subjectId);
    await sendJson("/api/results", {
      ...form,
      semesterNumber: selectedSubject?.semesterNumber ?? form.semesterNumber,
      grade: form.grade || undefined,
      credits: form.credits || undefined,
      internals: form.status === "ABSENT" || form.status === "WITHHELD" ? undefined : form.internals,
      externals: form.status === "ABSENT" || form.status === "WITHHELD" ? undefined : form.externals
    });
    await load();
    showToast("Result saved");
  }

  async function uploadPdf() {
    if (!pdfFile) {
      showToast("Choose a PDF file first", "error");
      return;
    }
    const body = new FormData();
    body.append("file", pdfFile);
    body.append("examType", form.examType || "SEMESTER_PDF");
    await sendForm("/api/results/import/pdf", body);
    setPdfFile(null);
    await load();
    showToast("PDF import queued. Results will update after background processing.", "info");
  }

  async function loadStudentResults(studentProfileId = form.studentProfileId) {
    if (!studentProfileId) return;
    const summary = await fetchJson<ResultSummary>(`/api/results/student/${studentProfileId}`);
    setResults(summary.results);
    showToast("Student results loaded");
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex gap-2">
          <ModuleExportButton
            apiPath="/api/results/export"
            pageName="Results"
            cardName="ResultEntries"
            queryParams={{
              pageSize: "100",
              studentProfileId: form.studentProfileId || undefined
            }}
          />
          <SafeActionButton run={() => load().then(() => showToast("Results refreshed"))}>Refresh</SafeActionButton>
        </div>
      </div>
      <form className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void saveResult(event)}>
        <Select
          value={form.studentProfileId}
          items={students.map((item) => [item.id, `${item.identity.rollNumber} - ${item.identity.fullName} (${item.structure.section})`])}
          onChange={(studentProfileId) => {
            const nextStudent = students.find((item) => item.id === studentProfileId);
            const nextSubject = subjects.find((item) => item.branchId === nextStudent?.structure.branchId && item.semesterNumber === nextStudent?.structure.semesterNumber);
            setForm({ ...form, studentProfileId, subjectId: nextSubject?.id ?? "", semesterNumber: nextStudent?.structure.semesterNumber ?? form.semesterNumber });
          }}
        />
        <Select value={form.subjectId} items={filteredSubjects.map((item) => [item.id, `${item.code} - ${item.name}`])} onChange={(subjectId) => setForm({ ...form, subjectId, semesterNumber: filteredSubjects.find((item) => item.id === subjectId)?.semesterNumber ?? form.semesterNumber })} />
        <input className={inputClass} value={form.examType} onChange={(event) => setForm({ ...form, examType: event.target.value })} placeholder="Exam type" required />
        <SearchableSelect value={form.status} options={statuses.map((status) => [status, status])} onChange={(status) => setForm({ ...form, status: status as ResultStatus })} />
        <input className={inputClass} type="number" min="0" max="100" value={form.internals} onChange={(event) => setForm({ ...form, internals: Number(event.target.value) })} placeholder="Internals" />
        <input className={inputClass} type="number" min="0" max="100" value={form.externals} onChange={(event) => setForm({ ...form, externals: Number(event.target.value) })} placeholder="Externals" />
        <input className={inputClass} value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} placeholder="Grade" />
        <input className={inputClass} type="number" min="0" max="10" step="0.5" value={form.credits} onChange={(event) => setForm({ ...form, credits: Number(event.target.value) })} placeholder="Credits" />
        <button className="erp-panel-submit md:col-span-2">Save Result</button>
        <button type="button" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 md:col-span-2" onClick={() => void loadStudentResults()}>Load Selected Student</button>
      </form>
      <div className="mt-4 grid gap-3 rounded-xl border bg-amber-50 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-sm font-bold text-slate-900">PDF Result Import</p>
          <p className="text-xs text-slate-600">Expected table columns: Sno, Htno, Subcode, Subname, Internals, Grade, Credits.</p>
        </div>
        <FilePickerTrigger
          label="Choose PDF file"
          fileName={pdfFile?.name}
          mode="pdf"
          onFile={(picked) => setPdfFile(picked)}
          className={`${inputClass} erp-file-picker-trigger`}
        />
        <SafeActionButton run={uploadPdf}>Queue PDF Import</SafeActionButton>
      </div>
      <ImportJobList jobs={importJobs} />
      <ResultsList results={results} />
    </section>
  );
}

export function StudentResultsPanel() {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<ResultSummary | null>(null);

  async function load() {
    setSummary(await fetchJson<ResultSummary>("/api/results/me"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load results", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">My Results</h2>
          <p className="text-sm text-slate-500">Semester-wise marks, credits, and failed-subject visibility.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Results refreshed"))}>Refresh</SafeActionButton>
      </div>
      {summary ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Stat label="Subjects" value={summary.summary.totalSubjects} />
            <Stat label="Passed" value={summary.summary.passed} />
            <Stat label="Failed/Absent" value={summary.summary.failed} />
            <Stat label="Credits Earned" value={summary.summary.creditsEarned} />
          </div>
          <ResultsList results={summary.results} />
        </>
      ) : <p className="text-sm text-slate-500">No results available yet.</p>}
    </section>
  );
}

function ResultsList({ results }: { results: ResultEntry[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="min-w-full divide-y text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Subject</th>
            <th className="px-3 py-2">Exam</th>
            <th className="px-3 py-2">Marks</th>
            <th className="px-3 py-2">Grade</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {results.map((item) => (
            <tr key={item.id} className={item.status === "FAIL" || item.status === "ABSENT" ? "bg-red-50" : ""}>
              <td className="px-3 py-2 font-medium">{item.student.rollNumber}<br /><span className="text-xs text-slate-500">{item.student.fullName}</span></td>
              <td className="px-3 py-2">{item.subject.code}<br /><span className="text-xs text-slate-500">{item.subject.name}</span></td>
              <td className="px-3 py-2">Sem {item.semesterNumber}<br /><span className="text-xs text-slate-500">{item.examType}</span></td>
              <td className="px-3 py-2">{item.totalMarks ?? "-"}<br /><span className="text-xs text-slate-500">I: {item.internals ?? "-"} E: {item.externals ?? "-"}</span></td>
              <td className="px-3 py-2">{item.grade ?? "-"}<br /><span className="text-xs text-slate-500">{item.credits ?? 0} credits</span></td>
              <td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{item.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {results.length === 0 ? <p className="p-4 text-sm text-slate-500">No results found.</p> : null}
    </div>
  );
}

function ImportJobList({ jobs }: { jobs: ImportJob[] }) {
  return (
    <div className="mt-4 rounded-xl border bg-white p-4">
      <h3 className="text-sm font-bold text-slate-950">Recent PDF Imports</h3>
      <div className="mt-3 grid gap-2">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{job.payload.originalName ?? "PDF import"}</span>
              <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold uppercase text-slate-700">{job.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Parsed {job.result?.parsed ?? 0}, imported {job.result?.imported ?? 0}, skipped {job.result?.skipped ?? 0}
              {job.error ? ` - ${job.error}` : ""}
            </p>
            {job.result?.errors?.length ? <p className="mt-1 text-xs text-red-600">{job.result.errors.slice(0, 2).join("; ")}</p> : null}
          </div>
        ))}
        {jobs.length === 0 ? <p className="text-sm text-slate-500">No PDF imports queued yet.</p> : null}
      </div>
    </div>
  );
}

function Select({ value, items, onChange }: { value: string; items: [string, string][]; onChange: (value: string) => void }) {
  return (
    <SearchableSelect value={value} options={items} onChange={onChange} required searchable={false} />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

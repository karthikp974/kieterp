import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { FormSelect } from "../../shared/FormSelect";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import type { HtpoResultSubjectRow, HtpoResultsSetup } from "../htpo-results-types";
import { RequireTeacherModule } from "../RequireTeacherModule";

const MAX_ROWS = 10;

function emptyRow(): HtpoResultSubjectRow {
  return { subjectCode: "", subjectName: "", internals: null, grade: null, credits: null };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

type StudentOption = { id: string; rollNumber: string; fullName: string; label: string };

export function TeacherPortalResultsAddPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [setup, setSetup] = useState<HtpoResultsSetup | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [sectionId, setSectionId] = useState("");
  const [semesterNumber, setSemesterNumber] = useState<number | "">("");
  const [semesterOptions, setSemesterOptions] = useState<{ value: number; label: string }[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentProfileId, setStudentProfileId] = useState("");
  const [selectedStudentLabel, setSelectedStudentLabel] = useState("");
  const [rows, setRows] = useState<HtpoResultSubjectRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    async function loadSetup() {
      setLoadingSetup(true);
      try {
        const res = await authFetch("/api/portals/teacher/results/setup");
        if (!res.ok) throw new Error(await readApiError(res, "Could not load results setup."));
        const data = (await res.json()) as HtpoResultsSetup;
        setSetup(data);
        setSectionId(data.fixedSectionId ?? data.sections[0]?.id ?? "");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load setup.", "error");
      } finally {
        setLoadingSetup(false);
      }
    }
    void loadSetup();
  }, [authFetch, showToast]);

  const loadSemesters = useCallback(async () => {
    if (!sectionId) {
      setSemesterOptions([]);
      setSemesterNumber("");
      return;
    }
    try {
      const res = await authFetch(`/api/portals/teacher/results/sections/${sectionId}/semesters`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load semesters."));
      const data = (await res.json()) as {
        currentSemesterNumber: number;
        semesters: { value: number; label: string }[];
      };
      setSemesterOptions(data.semesters);
      setSemesterNumber(data.currentSemesterNumber);
    } catch (error) {
      setSemesterOptions([]);
      showToast(error instanceof Error ? error.message : "Could not load semesters.", "error");
    }
  }, [authFetch, sectionId, showToast]);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  useEffect(() => {
    if (!sectionId || studentSearch.trim().length < 1) {
      setStudentOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: studentSearch.trim() });
        const res = await authFetch(`/api/portals/teacher/results/sections/${sectionId}/students?${params.toString()}`);
        if (!res.ok) throw new Error(await readApiError(res, "Could not search students."));
        const data = (await res.json()) as { students: StudentOption[] };
        setStudentOptions(data.students);
      } catch (error) {
        setStudentOptions([]);
        showToast(error instanceof Error ? error.message : "Student search failed.", "error");
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [authFetch, sectionId, studentSearch, showToast]);

  const loadExistingSemester = useCallback(async () => {
    if (!studentProfileId || !semesterNumber) return;
    try {
      const res = await authFetch(
        `/api/portals/teacher/results/students/${studentProfileId}/semesters/${semesterNumber}/form`
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load existing results."));
      const data = (await res.json()) as { rows: HtpoResultSubjectRow[] };
      if (data.rows.length) {
        setRows(data.rows.map((row) => ({ ...row })));
      } else {
        setRows([emptyRow()]);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load semester data.", "error");
    }
  }, [authFetch, semesterNumber, showToast, studentProfileId]);

  useEffect(() => {
    if (studentProfileId && semesterNumber) void loadExistingSemester();
  }, [studentProfileId, semesterNumber, loadExistingSemester]);

  const showSectionSelect = setup?.mode === "htpo" && (setup.sections.length > 1 || !setup.fixedSectionId);
  const sectionSelectOptions = useMemo(
    () => setup?.sections.map((section) => [section.id, section.label] as const) ?? [],
    [setup]
  );
  const semesterSelectOptions = useMemo(
    () => semesterOptions.map((semester) => [String(semester.value), semester.label] as const),
    [semesterOptions]
  );

  function pickStudent(student: StudentOption) {
    setStudentProfileId(student.id);
    setSelectedStudentLabel(student.label);
    setStudentSearch(student.label);
    setStudentOptions([]);
  }

  function updateRow(index: number, patch: Partial<HtpoResultSubjectRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => (current.length >= MAX_ROWS ? current : [...current, emptyRow()]));
  }

  function removeRow(index: number) {
    setRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sectionId || !studentProfileId || !semesterNumber) {
      showToast("Select section, semester, and student.", "error");
      return;
    }
    const payloadRows = rows.filter((row) => row.subjectCode.trim() || row.subjectName.trim());
    if (!payloadRows.length) {
      showToast("Add at least one subject row.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/portals/teacher/results/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          semesterNumber,
          studentProfileId,
          rows: payloadRows
        })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not save results."));
      showToast("Results saved.", "success");
      void navigate("/teacher/results");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save results.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSetup) {
    return (
      <RequireTeacherModule moduleKey="results">
        <p className="htpo-results-empty">Loading form…</p>
      </RequireTeacherModule>
    );
  }

  if (!setup?.canUpload) {
    return (
      <RequireTeacherModule moduleKey="results">
        <p className="htpo-results-empty">You do not have permission to add results.</p>
      </RequireTeacherModule>
    );
  }

  return (
    <RequireTeacherModule moduleKey="results">
      <form className="htpo-results-add-page" onSubmit={(event) => void onSubmit(event)}>
        <header className="htpo-results-add-head">
          <h1>Add result</h1>
          <p>Enter semester marks for one student. Up to {MAX_ROWS} subjects per save.</p>
        </header>

        <div className="htpo-results-add-grid">
          {showSectionSelect ? (
            <label className="htpo-results-filter">
              <span className="htpo-results-filter-label">Section</span>
              <FormSelect
                value={sectionId}
                options={sectionSelectOptions}
                onChange={(value) => {
                  setSectionId(value);
                  setStudentProfileId("");
                  setSelectedStudentLabel("");
                  setStudentSearch("");
                }}
              />
            </label>
          ) : null}

          <label className="htpo-results-filter">
            <span className="htpo-results-filter-label">Semester</span>
            <FormSelect
              value={semesterNumber === "" ? "" : String(semesterNumber)}
              options={semesterSelectOptions}
              onChange={(value) => setSemesterNumber(value ? Number(value) : "")}
            />
          </label>

          <label className="htpo-results-filter htpo-results-filter--search">
            <span className="htpo-results-filter-label">Search student</span>
            <input
              className="db-input"
              placeholder="Name or roll number"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setStudentProfileId("");
                setSelectedStudentLabel("");
              }}
            />
            {searching ? <span className="htpo-results-search-hint">Searching…</span> : null}
            {studentOptions.length ? (
              <ul className="htpo-results-student-list" role="listbox">
                {studentOptions.map((student) => (
                  <li key={student.id}>
                    <button type="button" onClick={() => pickStudent(student)}>
                      {student.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedStudentLabel ? <p className="htpo-results-selected-student">Selected: {selectedStudentLabel}</p> : null}
          </label>
        </div>

        <div className="htpo-results-subject-rows">
          {rows.map((row, index) => (
            <div key={`row-${index}`} className="htpo-results-subject-row">
              <div className="htpo-results-subject-row-head">
                <strong>Subject {index + 1}</strong>
                <div className="htpo-results-subject-row-tools">
                  {index === rows.length - 1 && rows.length < MAX_ROWS ? (
                    <button type="button" className="htpo-results-icon-btn" aria-label="Add subject row" onClick={addRow}>
                      <Plus size={14} aria-hidden />
                    </button>
                  ) : null}
                  {rows.length > 1 ? (
                    <button type="button" className="htpo-results-icon-btn" aria-label="Remove row" onClick={() => removeRow(index)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="htpo-results-subject-fields">
                <label>
                  <span>Sub code</span>
                  <input className="db-input" value={row.subjectCode} onChange={(e) => updateRow(index, { subjectCode: e.target.value })} />
                </label>
                <label>
                  <span>Sub name</span>
                  <input className="db-input" value={row.subjectName} onChange={(e) => updateRow(index, { subjectName: e.target.value })} />
                </label>
                <label>
                  <span>Internals</span>
                  <input
                    className="db-input"
                    inputMode="decimal"
                    value={row.internals ?? ""}
                    onChange={(e) => updateRow(index, { internals: parseOptionalNumber(e.target.value) })}
                  />
                </label>
                <label>
                  <span>Grade</span>
                  <input className="db-input" value={row.grade ?? ""} onChange={(e) => updateRow(index, { grade: e.target.value })} />
                </label>
                <label>
                  <span>Credits</span>
                  <input
                    className="db-input"
                    inputMode="decimal"
                    value={row.credits ?? ""}
                    onChange={(e) => updateRow(index, { credits: parseOptionalNumber(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="htpo-results-add-actions htpo-results-add-actions--stack">
          <button type="submit" className="htpo-results-action-btn htpo-results-action-btn--block" disabled={saving}>
            {saving ? "Saving…" : "Submit"}
          </button>
          <button type="button" className="htpo-results-action-btn htpo-results-action-btn--ghost htpo-results-action-btn--block" disabled={saving} onClick={() => void navigate("/teacher/results")}>
            Cancel
          </button>
        </div>
      </form>
    </RequireTeacherModule>
  );
}

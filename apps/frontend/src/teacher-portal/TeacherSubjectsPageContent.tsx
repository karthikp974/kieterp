import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { readApiErrorMessage } from "../shared/api-error";
import { usePortalConfirm } from "../shared/PortalConfirmDialog";
import { useToast } from "../shared/toast-context";
import { toFormSelectOptions, withEmptyOption } from "../shared/select-options";
import { TeacherSubjectEditSheet } from "./TeacherSubjectEditSheet";
import { TpCard, TpCardHead } from "./teacher-portal-ui";

type TeacherSectionOption = { id: string; label: string; name: string };

type TeacherSubject = {
  id: string;
  subjectName: string;
  subjectCode: string;
  semesterLabel: string;
  department: { id: string; code: string; name: string };
};

export function TeacherSubjectsPageContent() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();

  const [sections, setSections] = useState<TeacherSectionOption[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [semester, setSemester] = useState("");
  const [semesterOptions, setSemesterOptions] = useState<readonly FormSelectOption[]>([["", "Select semester"]]);
  const [subjects, setSubjects] = useState<TeacherSubject[]>([]);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ subjectName: "", subjectCode: "" });
  const [editSubject, setEditSubject] = useState<TeacherSubject | null>(null);

  const sectionOptions = useMemo(
    (): readonly FormSelectOption[] =>
      toFormSelectOptions(withEmptyOption(sections.map((section) => [section.id, section.label] as const), "Select section")),
    [sections]
  );

  const canAddSubject = Boolean(sectionId) && Boolean(semester);

  const loadSetup = useCallback(async () => {
    setLoadingSetup(true);
    try {
      const res = await authFetch("/api/portals/teacher/subjects/setup");
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to load your sections."));
      const data = (await res.json()) as { sections: TeacherSectionOption[] };
      setSections(data.sections);
      setSetupError(null);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Unable to load your sections.");
    } finally {
      setLoadingSetup(false);
    }
  }, [authFetch]);

  const loadSemesters = useCallback(async () => {
    if (!sectionId) {
      setSemesterOptions([["", "Select semester"]]);
      setSemester("");
      return;
    }
    setLoadingSemesters(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/sections/${sectionId}/semesters`);
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load semesters."));
      const data = (await res.json()) as {
        currentSemesterNumber: number;
        semesters: { value: number; label: string }[];
      };
      setSemesterOptions(
        toFormSelectOptions(
          withEmptyOption(data.semesters.map((row) => [String(row.value), row.label] as const), "Select semester")
        )
      );
      setSemester(String(data.currentSemesterNumber));
    } catch (error) {
      setSemesterOptions([["", "Select semester"]]);
      setSemester("");
      showToast(error instanceof Error ? error.message : "Could not load semesters.", "error");
    } finally {
      setLoadingSemesters(false);
    }
  }, [authFetch, sectionId, showToast]);

  const loadSubjects = useCallback(async () => {
    if (!sectionId || !semester) {
      setSubjects([]);
      return;
    }
    setLoadingSubjects(true);
    try {
      const res = await authFetch(
        `/api/portals/teacher/subjects?sectionId=${encodeURIComponent(sectionId)}&semesterNumber=${encodeURIComponent(semester)}`
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load subjects."));
      const data = (await res.json()) as { items: TeacherSubject[] };
      setSubjects(data.items);
    } catch (error) {
      setSubjects([]);
      showToast(error instanceof Error ? error.message : "Could not load subjects.", "error");
    } finally {
      setLoadingSubjects(false);
    }
  }, [authFetch, sectionId, semester, showToast]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    setEditSubject(null);
    void loadSemesters();
  }, [loadSemesters]);

  useEffect(() => {
    setEditSubject(null);
    void loadSubjects();
  }, [loadSubjects]);

  async function addSubject(event: FormEvent) {
    event.preventDefault();
    if (!canAddSubject || !form.subjectName.trim() || !form.subjectCode.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/portals/teacher/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          semesterNumber: Number(semester),
          subjectName: form.subjectName.trim(),
          subjectCode: form.subjectCode.trim()
        })
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not add subject."));
      setForm({ subjectName: "", subjectCode: "" });
      showToast("Subject added.");
      await loadSubjects();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add subject.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(values: { subjectName: string; subjectCode: string }) {
    if (!editSubject) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/subjects/${editSubject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not update subject."));
      setEditSubject(null);
      showToast("Subject updated.");
      await loadSubjects();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update subject.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeSubject(subject: TeacherSubject) {
    const ok = await confirm({
      title: "Delete subject?",
      message: "This subject will be removed from this section's subject list.",
      itemName: `${subject.subjectCode} — ${subject.subjectName}`,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/subjects/${subject.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not delete subject."));
      showToast("Subject deleted.", "warning");
      await loadSubjects();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete subject.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSetup) return <p className="tp-syllabus-muted">Loading your sections…</p>;
  if (setupError) {
    return (
      <TpCard>
        <p className="tp-syllabus-muted">{setupError}</p>
        <button type="button" className="db-wf-btn mt-3" onClick={() => void loadSetup()}>
          Retry
        </button>
      </TpCard>
    );
  }
  if (!sections.length) {
    return <p className="tp-syllabus-muted">No sections are assigned to you for subject management.</p>;
  }

  return (
    <div className="teacher-portal-module-stack tp-syllabus-page">
      <label className="db-field tp-subjects-section-field">
        <span>Select section</span>
        <FormSelect
          value={sectionId}
          options={sectionOptions}
          onChange={(id) => {
            setEditSubject(null);
            setSectionId(id);
          }}
        />
      </label>

      {sectionId ? (
        <label className="db-field tp-subjects-section-field">
          <span>Select semester</span>
          <FormSelect
            value={semester}
            options={semesterOptions}
            onChange={(value) => {
              setEditSubject(null);
              setSemester(value);
            }}
            disabled={loadingSemesters}
          />
        </label>
      ) : null}

      {canAddSubject ? (
        <TpCard className="tp-syllabus-card">
          <TpCardHead title="Add subject" />
          <form className="tp-subjects-add-form" onSubmit={addSubject}>
            <label className="db-field tp-syllabus-field">
              <span>Subject name</span>
              <input
                className="db-input"
                value={form.subjectName}
                placeholder="e.g. Data Structures"
                onChange={(event) => setForm({ ...form, subjectName: event.target.value })}
                required
              />
            </label>
            <label className="db-field tp-syllabus-field">
              <span>Subject ID / Subject code</span>
              <input
                className="db-input"
                value={form.subjectCode}
                placeholder="e.g. R231205"
                onChange={(event) => setForm({ ...form, subjectCode: event.target.value })}
                required
              />
            </label>
            <button type="submit" className="db-wf-btn db-wf-btn--primary" disabled={saving}>
              Add subject
            </button>
          </form>
        </TpCard>
      ) : null}

      <TpCard className="tp-syllabus-card">
        <TpCardHead title="Subjects" />
        {!sectionId ? (
          <p className="tp-syllabus-muted">Choose a section to view subjects.</p>
        ) : !semester ? (
          <p className="tp-syllabus-muted">Choose a semester to view subjects.</p>
        ) : loadingSubjects ? (
          <p className="tp-syllabus-muted">Loading subjects…</p>
        ) : !subjects.length ? (
          <p className="tp-syllabus-muted">No subjects for this section and semester.</p>
        ) : (
          <ul className="tp-subjects-list">
            {subjects.map((subject) => (
              <li key={subject.id} className="tp-subjects-row">
                <div className="tp-subjects-meta">
                  <strong>{subject.subjectName}</strong>
                  <span>
                    {subject.subjectCode} · {subject.semesterLabel} · {subject.department.code}
                  </span>
                </div>
                <div className="tp-subjects-actions">
                  <button type="button" className="db-wf-btn tp-subjects-action-btn" onClick={() => setEditSubject(subject)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="tp-subjects-glass-btn tp-subjects-glass-btn--danger"
                    disabled={saving}
                    onClick={() => void removeSubject(subject)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TpCard>

      <TeacherSubjectEditSheet
        open={Boolean(editSubject)}
        subject={editSubject}
        saving={saving}
        onClose={() => setEditSubject(null)}
        onSave={(values) => void saveEdit(values)}
      />
      {confirmDialog}
    </div>
  );
}

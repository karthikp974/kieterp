import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { FormSelect } from "../../shared/FormSelect";
import { useToast } from "../../shared/toast-context";
import type { HtpoAssignTeacherOptions } from "../htpo-timetable-assign-types";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalAssignTeacherPage() {
  const formId = useId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const loadRequestRef = useRef(0);

  const [options, setOptions] = useState<HtpoAssignTeacherOptions | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teacherProfileId, setTeacherProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(
    async (nextSubjectId: string, nextSectionId?: string, preferredTeacherId?: string) => {
      const requestId = ++loadRequestRef.current;
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        if (nextSubjectId) params.set("pickSubjectId", nextSubjectId);
        if (nextSectionId) params.set("pickSectionId", nextSectionId);
        const query = params.toString();
        const res = await authFetch(
          `/api/portals/teacher/timetable/subject-teachers/options${query ? `?${query}` : ""}`
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Could not load assign form options."));
        }
        const data = (await res.json()) as HtpoAssignTeacherOptions;
        if (requestId !== loadRequestRef.current) return;

        setOptions(data);

        const resolvedSubject =
          nextSubjectId && data.subjects.some((subject) => subject.id === nextSubjectId)
            ? nextSubjectId
            : data.selectedSubjectId || data.subjects[0]?.id || "";
        const resolvedSection =
          nextSectionId && data.sections.some((section) => section.id === nextSectionId)
            ? nextSectionId
            : data.selectedSectionId || data.sections[0]?.id || "";
        const resolvedTeacher =
          preferredTeacherId && data.teachers.some((teacher) => teacher.id === preferredTeacherId)
            ? preferredTeacherId
            : data.selectedTeacherId || data.teachers[0]?.id || "";

        setSubjectId(resolvedSubject);
        setSectionId(resolvedSection);
        setTeacherProfileId(resolvedTeacher);
      } catch (error) {
        if (requestId !== loadRequestRef.current) return;
        setOptions(null);
        setLoadError(error instanceof Error ? error.message : "Could not load assign form.");
      } finally {
        if (requestId === loadRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [authFetch]
  );

  useEffect(() => {
    void loadOptions(
      searchParams.get("pickSubjectId") ?? searchParams.get("subjectId") ?? "",
      searchParams.get("pickSectionId") ?? searchParams.get("sectionId") ?? undefined,
      searchParams.get("teacherProfileId") ?? undefined
    );
  }, [loadOptions, searchParams]);

  function handleSubjectChange(value: string) {
    setSubjectId(value);
    setSectionId("");
    setTeacherProfileId("");
    void loadOptions(value);
  }

  function handleSectionChange(value: string) {
    setSectionId(value);
    setTeacherProfileId("");
    void loadOptions(subjectId, value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectionId || !subjectId || !teacherProfileId) {
      showToast("Select subject, section, and teacher.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/portals/teacher/timetable/subject-teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, subjectId, teacherProfileId })
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not assign teacher."));
      }
      showToast("Teacher assigned to subject.", "success");
      void navigate("/teacher/timetable");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not assign teacher.", "error");
    } finally {
      setSaving(false);
    }
  }

  const subjectOptions = (options?.subjects ?? []).map((row) => [row.id, row.label] as [string, string]);
  const sectionOptions = (options?.sections ?? []).map((row) => [row.id, row.label] as [string, string]);
  const teacherOptions = (options?.teachers ?? []).map((row) => [row.id, row.label] as [string, string]);

  return (
    <RequireTeacherModule moduleKey="timetable">
      <div className="htpo-edit-tt-page-wrap">
        <form id={`${formId}-form`} className="htpo-edit-tt-page" onSubmit={(event) => void submit(event)}>
          {loading ? <p className="htpo-edit-tt-loading">Loading assign form…</p> : null}
          {loadError ? <p className="htpo-edit-tt-loading htpo-edit-tt-load-error">{loadError}</p> : null}

          <label className="htpo-edit-tt-field">
            <span className="htpo-edit-tt-label">Subject</span>
            <FormSelect
              value={subjectId}
              options={subjectOptions}
              onChange={handleSubjectChange}
              disabled={loading || !subjectOptions.length}
              required
            />
          </label>

          <label className="htpo-edit-tt-field">
            <span className="htpo-edit-tt-label">Section</span>
            <FormSelect
              value={sectionId}
              options={sectionOptions}
              onChange={handleSectionChange}
              disabled={loading || !subjectId || !sectionOptions.length}
              required
            />
          </label>

          <label className="htpo-edit-tt-field">
            <span className="htpo-edit-tt-label">Teacher</span>
            <FormSelect
              value={teacherProfileId}
              options={teacherOptions}
              onChange={setTeacherProfileId}
              disabled={loading || !sectionId || !teacherOptions.length}
              required
            />
          </label>

          {!loading && subjectId && sectionId && !teacherOptions.length ? (
            <p className="htpo-edit-tt-loading">No STPO teachers registered for this section and subject.</p>
          ) : null}

          <div className="htpo-edit-tt-page-actions" role="group" aria-label="Assign teacher actions">
            <button
              type="submit"
              className="htpo-edit-tt-submit"
              disabled={saving || loading || !subjectId || !sectionId || !teacherOptions.length}
            >
              {saving ? "Assigning…" : "Assign"}
            </button>
            <button
              type="button"
              className="htpo-edit-tt-cancel"
              disabled={saving}
              onClick={() => void navigate("/teacher/timetable")}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </RequireTeacherModule>
  );
}

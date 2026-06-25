import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { FormSelect } from "../shared/FormSelect";
import { useToast } from "../shared/toast-context";
import { toFormSelectOptions } from "../shared/select-options";
import { StudentSubjectProgressCard } from "./subjects/StudentSubjectProgressCard";
import { StudentSyllabusDetailModal } from "./subjects/StudentSyllabusDetailModal";
import type { StudentMySubjectsResponse, StudentSubjectSemestersResponse } from "./subjects/student-subjects-types";
import { StudentPortalSubjectsSkeleton } from "./subjects/StudentPortalSubjectsSkeleton";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

function semesterOptionLabel(row: StudentSubjectSemestersResponse["semesters"][number]) {
  return row.isCurrent ? `${row.label} (ongoing sem)` : row.label;
}

export function StudentPortalSubjectsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [semestersPayload, setSemestersPayload] = useState<StudentSubjectSemestersResponse | null>(null);
  const [selectedSemester, setSelectedSemester] = useState("");
  const [data, setData] = useState<StudentMySubjectsResponse | null>(null);
  const [loadingSemesters, setLoadingSemesters] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [syllabusSubjectId, setSyllabusSubjectId] = useState<string | null>(null);
  const [syllabusLabel, setSyllabusLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSemesters() {
      setLoadingSemesters(true);
      try {
        const res = await authFetch("/api/portals/student/subjects/semesters");
        if (!res.ok) throw await readError(res);
        const payload = (await res.json()) as StudentSubjectSemestersResponse;
        if (cancelled) return;
        setSemestersPayload(payload);
        setSelectedSemester(String(payload.currentSemesterNumber));
      } catch (e) {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load semesters.", "error");
          setSemestersPayload(null);
        }
      } finally {
        if (!cancelled) setLoadingSemesters(false);
      }
    }
    void loadSemesters();
    return () => {
      cancelled = true;
    };
  }, [authFetch, showToast]);

  const loadSubjects = useCallback(
    async (semesterNumber: string) => {
      if (!semesterNumber) return;
      setLoadingSubjects(true);
      try {
        const qs = new URLSearchParams({ semesterNumber });
        const res = await authFetch(`/api/portals/student/subjects?${qs.toString()}`);
        if (!res.ok) throw await readError(res);
        setData((await res.json()) as StudentMySubjectsResponse);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load subjects.", "error");
        setData(null);
      } finally {
        setLoadingSubjects(false);
      }
    },
    [authFetch, showToast]
  );

  useEffect(() => {
    if (!selectedSemester) return;
    void loadSubjects(selectedSemester);
  }, [loadSubjects, selectedSemester]);

  const openSyllabus = (subjectId: string, label: string) => {
    setSyllabusLabel(label);
    setSyllabusSubjectId(subjectId);
  };

  if (loadingSemesters && !semestersPayload) {
    return <StudentPortalSubjectsSkeleton />;
  }

  if (!semestersPayload) {
    return <p className="sp-dash-error">Subjects could not be loaded.</p>;
  }

  const semesterOptions = toFormSelectOptions(
    semestersPayload.semesters.map((row) => [String(row.value), semesterOptionLabel(row)] as const)
  );

  const subline = data
    ? `${data.section.campusCode} · ${data.section.classLabel} · ${data.section.code ?? data.section.name}`
    : null;

  const selectedSemesterLabel =
    semestersPayload.semesters.find((row) => String(row.value) === selectedSemester)?.label ?? selectedSemester;

  return (
    <div className="sp-subj">
      <header className="sp-subj-head">
        <label className="sp-syl-label" htmlFor="sp-subj-semester-select">
          Semester
        </label>
        <FormSelect
          id="sp-subj-semester-select"
          value={selectedSemester}
          options={semesterOptions}
          className="sp-syl-select sp-subj-sem-select"
          onChange={(value) => setSelectedSemester(value)}
        />
        <p className="sp-subj-page-sub">Subjects for semester {selectedSemesterLabel}.</p>
        {subline ? <p className="sp-subj-page-meta">{subline}</p> : null}
      </header>

      {loadingSubjects && !data ? (
        <StudentPortalSubjectsSkeleton showHead={false} />
      ) : !data ? (
        <p className="sp-dash-error">Subjects could not be loaded.</p>
      ) : data.subjects.length === 0 ? (
        <p className="sp-subj-empty">No subjects are mapped to your section for this semester yet.</p>
      ) : (
        <SubjectCardGrid subjects={data.subjects} onViewSyllabus={openSyllabus} syllabusSubjectId={syllabusSubjectId} />
      )}

      {syllabusSubjectId ? (
        <StudentSyllabusDetailModal
          subjectId={syllabusSubjectId}
          subjectLabel={syllabusLabel}
          semesterNumber={Number(selectedSemester)}
          onClose={() => setSyllabusSubjectId(null)}
        />
      ) : null}
    </div>
  );
}

function SubjectCardGrid({
  subjects,
  onViewSyllabus,
  syllabusSubjectId
}: {
  subjects: StudentMySubjectsResponse["subjects"];
  onViewSyllabus: (id: string, label: string) => void;
  syllabusSubjectId: string | null;
}) {
  return (
    <div className="sp-subj-grid">
      {subjects.map((subject) => (
        <StudentSubjectProgressCard
          key={subject.id}
          subject={subject}
          syllabusLoading={syllabusSubjectId === subject.id}
          onViewSyllabus={() => onViewSyllabus(subject.id, `${subject.code} — ${subject.name}`)}
        />
      ))}
    </div>
  );
}

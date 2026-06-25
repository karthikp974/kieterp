import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { readApiErrorMessage } from "../shared/api-error";
import { useToast } from "../shared/toast-context";
import { toFormSelectOptions, withEmptyOption } from "../shared/select-options";
import type {
  TeacherSyllabusCompletionUnit,
  TeacherSyllabusDetailResponse,
  TeacherSyllabusProgress,
  TeacherSyllabusSetup,
  TeacherSyllabusSubject,
  TeacherSyllabusUnit
} from "./teacher-syllabus-types";
import { TpCard, TpCardHead } from "./teacher-portal-ui";
import { TeacherSyllabusCreateSheet } from "./TeacherSyllabusCreateSheet";

function syllabusManageHref(subjectId: string, mode: "create" | "edit", label: string) {
  const query = new URLSearchParams({
    subjectId,
    mode,
    label
  });
  return `/teacher/syllabus/manage?${query.toString()}`;
}

function useSectionSemSubjectFlow(
  sections: TeacherSyllabusSetup["sections"],
  options?: { fixedSectionId?: string | null; showSectionFilter?: boolean }
) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const showSectionFilter = options?.showSectionFilter ?? true;
  const [sectionId, setSectionId] = useState(() =>
    !showSectionFilter && options?.fixedSectionId ? options.fixedSectionId : ""
  );
  const [semester, setSemester] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [semesterOptions, setSemesterOptions] = useState<readonly FormSelectOption[]>([["", "Select semester"]]);
  const [subjects, setSubjects] = useState<TeacherSyllabusSubject[]>([]);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  const sectionOptions = useMemo(
    (): readonly FormSelectOption[] =>
      toFormSelectOptions(withEmptyOption(sections.map((section) => [section.id, section.label] as const), "Select section")),
    [sections]
  );

  const subjectOptions = useMemo(
    (): readonly FormSelectOption[] =>
      toFormSelectOptions(withEmptyOption(subjects.map((subject) => [subject.id, subject.label] as const), "Select subject")),
    [subjects]
  );

  useEffect(() => {
    if (!sectionId) {
      setSemesterOptions([["", "Select semester"]]);
      setSemester("");
      setSubjects([]);
      setSubjectId("");
      return;
    }

    let cancelled = false;
    setLoadingSemesters(true);
    void authFetch(`/api/portals/teacher/syllabus/sections/${sectionId}/semesters`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load semesters."));
        const data = (await res.json()) as {
          currentSemesterNumber: number;
          semesters: { value: number; label: string }[];
        };
        if (cancelled) return;
        setSemesterOptions(
          toFormSelectOptions(
            withEmptyOption(data.semesters.map((row) => [String(row.value), row.label] as const), "Select semester")
          )
        );
        setSemester(String(data.currentSemesterNumber));
      })
      .catch((error) => {
        setSemesterOptions([["", "Select semester"]]);
        setSemester("");
        showToast(error instanceof Error ? error.message : "Could not load semesters.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingSemesters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authFetch, sectionId, showToast]);

  useEffect(() => {
    if (!sectionId || !semester) {
      setSubjects([]);
      setSubjectId("");
      return;
    }

    let cancelled = false;
    setLoadingSubjects(true);
    void authFetch(
      `/api/portals/teacher/syllabus/sections/${sectionId}/subjects?semesterNumber=${encodeURIComponent(semester)}`
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load subjects."));
        const data = (await res.json()) as { subjects: TeacherSyllabusSubject[] };
        if (cancelled) return;
        setSubjects(data.subjects);
        setSubjectId((current) => (data.subjects.some((subject) => subject.id === current) ? current : ""));
      })
      .catch((error) => {
        setSubjects([]);
        setSubjectId("");
        showToast(error instanceof Error ? error.message : "Could not load subjects.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingSubjects(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authFetch, sectionId, semester, showToast]);

  function onSectionChange(id: string) {
    setSectionId(id);
    setSubjectId("");
  }

  function onSemesterChange(value: string) {
    setSemester(value);
    setSubjectId("");
  }

  return {
    sectionId,
    onSectionChange,
    semester,
    onSemesterChange,
    subjectId,
    setSubjectId,
    sectionOptions,
    semesterOptions,
    subjectOptions,
    subjects,
    loadingSemesters,
    loadingSubjects
  };
}

function SectionSemSubjectFilters({
  flow,
  fixedSectionLabel
}: {
  flow: ReturnType<typeof useSectionSemSubjectFlow>;
  fixedSectionLabel?: string;
}) {
  return (
    <>
      {fixedSectionLabel ? (
        <div className="htpo-engage-section-filter htpo-engage-section-filter--fixed">
          <span className="htpo-engage-section-filter-label">Section</span>
          <span className="htpo-engage-section-chip">{fixedSectionLabel}</span>
        </div>
      ) : (
        <label className="db-field tp-syllabus-field">
          <span>Select section</span>
          <FormSelect value={flow.sectionId} options={flow.sectionOptions} onChange={flow.onSectionChange} />
        </label>
      )}

      {flow.sectionId ? (
        <label className="db-field tp-syllabus-field">
          <span>Select semester</span>
          <FormSelect
            value={flow.semester}
            options={flow.semesterOptions}
            onChange={flow.onSemesterChange}
            disabled={flow.loadingSemesters}
          />
        </label>
      ) : null}

      {flow.sectionId && flow.semester ? (
        <label className="db-field tp-syllabus-field">
          <span>Select subject</span>
          <FormSelect
            value={flow.subjectId}
            options={flow.subjectOptions}
            onChange={flow.setSubjectId}
            disabled={flow.loadingSubjects}
          />
        </label>
      ) : null}
    </>
  );
}

function SubjectSyllabusCard({
  setup,
  flow
}: {
  setup: TeacherSyllabusSetup;
  flow: ReturnType<typeof useSectionSemSubjectFlow>;
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TeacherSyllabusDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const resolvedSectionId = setup.showSectionFilter ? flow.sectionId : setup.fixedSectionId ?? flow.sectionId;
  const fixedSectionLabel = !setup.showSectionFilter
    ? setup.sections.find((section) => section.id === resolvedSectionId)?.label
    : undefined;

  const selectedSection = setup.sections.find((section) => section.id === resolvedSectionId);
  const selectedSubject = flow.subjects.find((subject) => subject.id === flow.subjectId);

  const loadDetail = useCallback(async () => {
    if (!flow.subjectId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/subjects/${flow.subjectId}`);
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load syllabus."));
      setDetail((await res.json()) as TeacherSyllabusDetailResponse);
    } catch (error) {
      setDetail(null);
      showToast(error instanceof Error ? error.message : "Could not load syllabus.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, flow.subjectId, showToast]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const units: TeacherSyllabusUnit[] = detail?.exists ? detail.syllabus.units : [];
  const subjectContextLabel =
    selectedSubject && selectedSection
      ? `${selectedSection.label} — Sem ${flow.semester} — ${selectedSubject.label}`
      : selectedSubject?.label ?? "";

  function openManage() {
    if (!flow.subjectId) return;
    navigate(syllabusManageHref(flow.subjectId, "edit", subjectContextLabel));
  }

  function openCreate() {
    if (!flow.subjectId) return;
    setCreateOpen(true);
  }

  return (
    <>
      <TpCard className="tp-syllabus-card">
        <TpCardHead title="Syllabus" />
        <SectionSemSubjectFilters flow={flow} fixedSectionLabel={fixedSectionLabel} />

        {!resolvedSectionId ? (
          <p className="tp-syllabus-muted">Choose your assigned section to manage syllabus.</p>
        ) : !flow.semester ? (
          <p className="tp-syllabus-muted">Choose a semester for this section.</p>
        ) : flow.loadingSubjects ? (
          <p className="tp-syllabus-muted">Loading subjects…</p>
        ) : !flow.subjects.length ? (
          <p className="tp-syllabus-muted">
            No subjects for this section and semester. Add subjects under Subjects, or link them in admin.
          </p>
        ) : !flow.subjectId ? (
          <p className="tp-syllabus-muted">Choose a subject for this semester.</p>
        ) : loading ? (
          <p className="tp-syllabus-muted">Loading syllabus…</p>
        ) : !detail?.exists ? (
          <div className="tp-syllabus-empty">
            <p>No syllabus added.</p>
            <button type="button" className="db-wf-btn db-wf-btn--primary" onClick={openCreate}>
              Create syllabus
            </button>
          </div>
        ) : (
          <div className="tp-syllabus-preview">
            <div className="tp-syllabus-preview-units">
              {units.map((unit, unitIndex) => (
                <article key={unit.id} className="tp-syllabus-preview-unit">
                  <h3>
                    Unit {unitIndex + 1} — {unit.unitTitle}
                  </h3>
                  {unit.topics.length ? (
                    <ul className="tp-syllabus-preview-topics">
                      {unit.topics.map((topic, topicIndex) => (
                        <li key={topic.id}>
                          <span className="tp-syllabus-topic-no">Topic {topicIndex + 1}</span> {topic.topicTitle}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tp-syllabus-muted">No topics in this unit yet.</p>
                  )}
                </article>
              ))}
            </div>
            <button type="button" className="db-wf-btn db-wf-btn--primary" onClick={openManage}>
              Manage syllabus
            </button>
          </div>
        )}
      </TpCard>

      <TeacherSyllabusCreateSheet
        open={createOpen && Boolean(flow.subjectId)}
        subjectId={flow.subjectId}
        subjectLabel={subjectContextLabel}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          void loadDetail();
        }}
      />
    </>
  );
}

function CompletionCard({
  sectionId,
  semester,
  subjectId
}: {
  sectionId: string;
  semester: string;
  subjectId: string;
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [units, setUnits] = useState<TeacherSyllabusCompletionUnit[]>([]);
  const [progress, setProgress] = useState<TeacherSyllabusProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);

  const loadCompletion = useCallback(async () => {
    if (!sectionId || !subjectId || !semester) {
      setUnits([]);
      setProgress(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sectionId,
        subjectId,
        semesterNumber: semester
      });
      const res = await authFetch(`/api/portals/teacher/syllabus/completion?${params.toString()}`);
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load completion."));
      const data = (await res.json()) as {
        units: TeacherSyllabusCompletionUnit[];
        progress: TeacherSyllabusProgress;
      };
      setUnits(data.units);
      setProgress(data.progress);
    } catch (error) {
      setUnits([]);
      setProgress(null);
      showToast(error instanceof Error ? error.message : "Could not load completion.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, sectionId, semester, showToast, subjectId]);

  useEffect(() => {
    void loadCompletion();
  }, [loadCompletion]);

  async function toggleTopic(topicId: string, isCompleted: boolean) {
    if (!sectionId) return;
    setSavingTopicId(topicId);
    try {
      const res = await authFetch("/api/portals/teacher/syllabus/topic-completion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, topicId, isCompleted })
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not save completion."));
      const data = (await res.json()) as { progress: TeacherSyllabusProgress };
      setProgress(data.progress);
      setUnits((current) =>
        current.map((unit) => ({
          ...unit,
          topics: unit.topics.map((topic) => (topic.id === topicId ? { ...topic, isCompleted } : topic))
        }))
      );
      showToast(isCompleted ? "Topic marked complete." : "Topic marked incomplete.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save completion.", "error");
    } finally {
      setSavingTopicId(null);
    }
  }

  return (
    <TpCard className="tp-syllabus-card">
      <TpCardHead title="Mark completed syllabus" />

      {progress ? (
        <p className="tp-syllabus-progress">
          Progress: {progress.progressPercent}% ({progress.completedTopics}/{progress.totalTopics} topics)
        </p>
      ) : null}

      {loading ? (
        <p className="tp-syllabus-muted">Loading checklist…</p>
      ) : !units.length ? (
        <p className="tp-syllabus-muted">Add syllabus topics above to mark completion here.</p>
      ) : (
        <div className="tp-syllabus-checklist">
          {units.map((unit) => (
            <article key={unit.id} className="tp-syllabus-checklist-unit">
              <h3>{unit.unitTitle}</h3>
              <ul>
                {unit.topics.map((topic) => (
                  <li key={topic.id}>
                    <label className="tp-syllabus-check">
                      <input
                        type="checkbox"
                        checked={topic.isCompleted}
                        disabled={savingTopicId === topic.id}
                        onChange={(event) => void toggleTopic(topic.id, event.target.checked)}
                      />
                      <span>{topic.topicTitle}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </TpCard>
  );
}

function useTeacherSyllabusSetup() {
  const { authFetch } = useAuth();
  const [setup, setSetup] = useState<TeacherSyllabusSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSetup = useCallback(async () => {
    const res = await authFetch("/api/portals/teacher/syllabus/setup");
    if (!res.ok) throw new Error(await readApiErrorMessage(res, "Unable to load syllabus setup."));
    const data = (await res.json()) as TeacherSyllabusSetup;
    setSetup(data);
    setLoadError(null);
  }, [authFetch]);

  useEffect(() => {
    setLoading(true);
    void loadSetup()
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Unable to load syllabus setup."))
      .finally(() => setLoading(false));
  }, [loadSetup]);

  return { setup, loading, loadError, loadSetup };
}

function SyllabusSetupGate({
  state,
  children
}: {
  state: ReturnType<typeof useTeacherSyllabusSetup>;
  children: (setup: TeacherSyllabusSetup) => ReactElement;
}) {
  const { showToast } = useToast();
  if (state.loading) return <p className="tp-syllabus-muted">Loading syllabus…</p>;
  if (state.loadError) {
    return (
      <TpCard>
        <p className="tp-syllabus-muted">{state.loadError}</p>
        <button type="button" className="db-wf-btn mt-3" onClick={() => void state.loadSetup().catch((e) => showToast(String(e), "error"))}>
          Retry
        </button>
      </TpCard>
    );
  }
  if (!state.setup?.sections.length) {
    return <p className="tp-syllabus-muted">No assigned sections found.</p>;
  }
  return children(state.setup);
}

function SyllabusManagePageInner({ setup }: { setup: TeacherSyllabusSetup }) {
  const flow = useSectionSemSubjectFlow(setup.sections, {
    fixedSectionId: setup.fixedSectionId,
    showSectionFilter: setup.showSectionFilter
  });

  return (
    <div className="teacher-portal-module-stack tp-syllabus-page">
      <SubjectSyllabusCard setup={setup} flow={flow} />
    </div>
  );
}

function SyllabusProgressPageInner({ setup }: { setup: TeacherSyllabusSetup }) {
  const flow = useSectionSemSubjectFlow(setup.sections, {
    fixedSectionId: setup.fixedSectionId,
    showSectionFilter: setup.showSectionFilter
  });

  const resolvedSectionId = setup.showSectionFilter ? flow.sectionId : setup.fixedSectionId ?? flow.sectionId;
  const fixedSectionLabel = !setup.showSectionFilter
    ? setup.sections.find((section) => section.id === resolvedSectionId)?.label
    : undefined;

  return (
    <div className="teacher-portal-module-stack tp-syllabus-page">
      <TpCard className="tp-syllabus-card">
        <TpCardHead title="Update syllabus progress" />
        <SectionSemSubjectFilters flow={flow} fixedSectionLabel={fixedSectionLabel} />
      </TpCard>
      {flow.subjectId && flow.semester && resolvedSectionId ? (
        <CompletionCard sectionId={resolvedSectionId} semester={flow.semester} subjectId={flow.subjectId} />
      ) : null}
    </div>
  );
}

/** "Syllabus" page — add / edit / delete units and topics. */
export function TeacherSyllabusManageContent() {
  const state = useTeacherSyllabusSetup();
  return (
    <SyllabusSetupGate state={state}>
      {(setup) => <SyllabusManagePageInner setup={setup} />}
    </SyllabusSetupGate>
  );
}

/** "Update Syllabus" page — mark how many topics are covered per section. */
export function TeacherSyllabusProgressContent() {
  const state = useTeacherSyllabusSetup();
  return (
    <SyllabusSetupGate state={state}>
      {(setup) => <SyllabusProgressPageInner setup={setup} />}
    </SyllabusSetupGate>
  );
}

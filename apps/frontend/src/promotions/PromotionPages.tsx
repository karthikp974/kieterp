import { ArrowLeft, CheckSquare, History, Square, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ComponentProps, MouseEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AdminWorkflowMenuButton, OptionActionButton, WorkflowSection } from "../shared/OptionPage";
import { safeRandomId } from "../shared/safe-random-id";
import { SearchableSelect } from "../shared/SearchableSelect";
import { semesterPairLabelForAcademicYear, academicYearIndexFromLinearSemester } from "./promotion-semester";
import { ProfileMenuButton } from "../shared/ProfileMenu";
import { useToast } from "../shared/toast-context";
import { programsForOperationalCampus, type CampusPicker, type ProgramPicker } from "../shared/academic-catalog";
import { PaginatedResponse, type Batch, type Branch, type Campus, type Program } from "../structure/structure-types";

type PromotionClass = {
  id: string;
  name: string;
  code: string;
  semesterNumber: number;
  yearNumber: number;
  campusId?: string;
  programId: string;
  branchId: string;
  batch: string;
  batchId: string;
  branch: string;
  branchCode: string;
  program: string;
  campus?: string;
  sections: number;
  branchDurationYears?: number;
};

type PromotionSection = {
  id: string;
  name: string;
  semesterNumber: number;
  classId: string;
  branchId: string;
  branch: string;
  batch: string;
};

type PromotionStudent = {
  id: string;
  fullName: string;
  rollNumber: string;
  currentSemester: number;
  currentClass: string;
  currentSection: string;
};

type SemesterPairRow = { academicYearIndex: number; label: string; semesterNumbers: [number, number] };

type SemesterPairsPayload = {
  branchId: string;
  durationYears: number;
  maxSemester: number;
  pairs: SemesterPairRow[];
};

type PromotionWorkflowResult = {
  promoted: number;
  reassigned?: number;
  message?: string;
  fromSection?: PromotionSection;
  toSection?: PromotionSection;
};

type ReassignmentDraft = { academicYearIndex: number; classId: string; sectionId: string };

type SearchableSelectProps = ComponentProps<typeof SearchableSelect>;

/** Plain dropdown: no search row, no clear. Defaults to `required` for validation hints. */
function PromotionDropdown(props: Omit<SearchableSelectProps, "searchable" | "clearable">) {
  const { required = true, ...rest } = props;
  return <SearchableSelect searchable={false} clearable={false} required={required} {...rest} />;
}

function HubActionButton({ children, description, icon, onClick }: { children: ReactNode; description: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <OptionActionButton description={description} icon={icon} onClick={onClick}>
      {children}
    </OptionActionButton>
  );
}

export function PromotionHomePage() {
  const navigate = useNavigate();
  return (
    <PromotionShell title="Promotion" variant="main">
      <WorkflowSection title="Promote">
        <HubActionButton
          description="Select campus through section, promote students, and reassign non-promoted students."
          icon={Users}
          onClick={() => navigate("/promotion/promote-students")}
        >
          Promote students
        </HubActionButton>
      </WorkflowSection>
      <WorkflowSection title="Activity">
        <HubActionButton
          description="View recent promotion activity and audit records."
          icon={History}
          onClick={() => navigate("/promotion/history")}
        >
          Promotion history
        </HubActionButton>
      </WorkflowSection>
    </PromotionShell>
  );
}

export function PromotionRunPage() {
  const api = usePromotionWizardApi();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [campusId, setCampusId] = useState("");
  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [sourceClassId, setSourceClassId] = useState("");
  const [sourceSectionId, setSourceSectionId] = useState("");

  const [destClassId, setDestClassId] = useState("");
  const [destSectionId, setDestSectionId] = useState("");

  const [promotedIds, setPromotedIds] = useState<string[]>([]);
  const [reassignmentByStudent, setReassignmentByStudent] = useState<Record<string, ReassignmentDraft>>({});

  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => safeRandomId("promotion"));
  const [submitting, setSubmitting] = useState(false);

  const campus = api.campuses.find((c) => c.id === campusId);
  const program = api.programs.find((p) => p.id === programId);
  const branch = api.branches.find((b) => b.id === branchId);
  const batch = api.batches.find((b) => b.id === batchId);
  const sourceClass = api.sourceClasses.find((c) => c.id === sourceClassId) ?? null;
  const sourceAcademicYear = sourceClass ? academicYearIndexFromLinearSemester(sourceClass.semesterNumber) : null;

  const durationYears = api.semesterPairs?.durationYears ?? branch?.durationYears ?? 4;
  const nextAcademicYearIndex = sourceAcademicYear !== null && sourceAcademicYear >= 1 ? sourceAcademicYear + 1 : null;
  const canPromoteForward = nextAcademicYearIndex !== null && nextAcademicYearIndex <= durationYears;
  const nextPairLabel =
    nextAcademicYearIndex !== null && canPromoteForward ? semesterPairLabelForAcademicYear(nextAcademicYearIndex) : "—";

  useEffect(() => {
    void api.loadCampuses();
  }, [api.loadCampuses]);

  useEffect(() => {
    if (!campusId) {
      api.resetPrograms();
      return;
    }
    void api.loadPrograms(campusId);
  }, [api.loadPrograms, api.resetPrograms, campusId]);

  useEffect(() => {
    if (!programId) {
      api.resetBranches();
      return;
    }
    void api.loadBranches(programId);
  }, [api.loadBranches, api.resetBranches, programId]);

  useEffect(() => {
    if (!branchId) {
      api.resetBatches();
      return;
    }
    void api.loadBatches(branchId);
    void api.loadSemesterPairs(branchId);
  }, [api.loadBatches, api.loadSemesterPairs, api.resetBatches, branchId]);

  useEffect(() => {
    if (!batchId) {
      api.clearSourceClasses();
      return;
    }
    void api.loadClassesForBatch(batchId, "source");
  }, [api.clearSourceClasses, api.loadClassesForBatch, batchId]);

  useEffect(() => {
    if (!sourceClassId) {
      api.clearSourceSections();
      return;
    }
    void api.loadSections(sourceClassId, "source");
  }, [api.clearSourceSections, api.loadSections, sourceClassId]);

  useEffect(() => {
    if (!batchId || !nextAcademicYearIndex || !canPromoteForward) {
      api.clearDestClasses();
      return;
    }
    void api.loadClassesForBatch(batchId, "dest", nextAcademicYearIndex);
  }, [api.clearDestClasses, api.loadClassesForBatch, batchId, canPromoteForward, nextAcademicYearIndex]);

  useEffect(() => {
    if (!destClassId) {
      api.clearDestSections();
      return;
    }
    void api.loadSections(destClassId, "dest");
  }, [api.clearDestSections, api.loadSections, destClassId]);

  useEffect(() => {
    if (!sourceClassId || !sourceSectionId) {
      api.clearStudents();
      setPromotedIds([]);
      return;
    }
    void api.loadAllStudents(sourceClassId, sourceSectionId).then((items) => {
      setPromotedIds(items.map((s) => s.id));
      setIdempotencyKey(safeRandomId("promotion"));
    });
  }, [api.clearStudents, api.loadAllStudents, sourceClassId, sourceSectionId]);

  useEffect(() => {
    if (step === 3 && !canPromoteForward) setPromotedIds([]);
  }, [canPromoteForward, step]);

  const campusOptions = useMemo(() => api.campuses.map((c) => [c.id, `${c.code} — ${c.name}`] as [string, string]), [api.campuses]);
  const programOptions = useMemo(() => api.programs.map((p) => [p.id, `${p.code} — ${p.name}`] as [string, string]), [api.programs]);
  const branchOptions = useMemo(() => api.branches.map((b) => [b.id, `${b.code} — ${b.name}`] as [string, string]), [api.branches]);
  const batchOptions = useMemo(() => api.batches.map((b) => [b.id, `${b.startYear}–${b.endYear}`] as [string, string]), [api.batches]);
  const pairOptions = useMemo(
    () => (api.semesterPairs?.pairs ?? []).map((p) => [String(p.academicYearIndex), p.label] as [string, string]),
    [api.semesterPairs]
  );
  const sourceClassOptions = useMemo(
    () => api.sourceClasses.map((c) => [c.id, `${c.name} (semester ${c.semesterNumber})`] as [string, string]),
    [api.sourceClasses]
  );
  const sourceSectionOptions = useMemo(
    () => api.sourceSections.map((s) => [s.id, s.name] as [string, string]),
    [api.sourceSections]
  );
  const destClassOptions = useMemo(
    () => api.destClasses.map((c) => [c.id, `${c.name} (semester ${c.semesterNumber})`] as [string, string]),
    [api.destClasses]
  );
  const destSectionOptions = useMemo(
    () => api.destSections.map((s) => [s.id, s.name] as [string, string]),
    [api.destSections]
  );

  const nonPromotedStudents = useMemo(
    () => api.students.filter((s) => !promotedIds.includes(s.id)),
    [api.students, promotedIds]
  );

  const step1Complete = useMemo(
    () =>
      Boolean(campusId && programId && branchId && batchId && sourceClassId && sourceSectionId),
    [batchId, branchId, campusId, programId, sourceClassId, sourceSectionId]
  );

  const step2Complete = useMemo(
    () => step1Complete && (!canPromoteForward || Boolean(destClassId && destSectionId)),
    [canPromoteForward, destClassId, destSectionId, step1Complete]
  );

  const step3Complete = useMemo(() => step2Complete && api.students.length > 0, [api.students.length, step2Complete]);

  const step4ReassignmentsComplete = useMemo(() => {
    if (nonPromotedStudents.length === 0) return true;
    return nonPromotedStudents.every((s) => Boolean((reassignmentByStudent[s.id]?.sectionId ?? "").trim()));
  }, [nonPromotedStudents, reassignmentByStudent]);

  const submitReady = useMemo(() => {
    if (!step1Complete || !api.students.length) return false;
    if (promotedIds.length > 0) {
      if (!canPromoteForward || !destSectionId.trim()) return false;
    }
    return step4ReassignmentsComplete;
  }, [api.students.length, canPromoteForward, destSectionId, promotedIds.length, step1Complete, step4ReassignmentsComplete]);

  const loadCardClasses = useCallback(
    (year: number) => api.listClassesForBatchYear(batchId, year),
    [api.listClassesForBatchYear, batchId]
  );
  const loadCardSections = useCallback((classId: string) => api.listSectionsForClass(classId), [api.listSectionsForClass]);

  function resetHierarchy(from: "campus" | "program" | "branch" | "batch" | "class") {
    if (from === "campus") {
      setProgramId("");
      setBranchId("");
      setBatchId("");
      setSourceClassId("");
      setSourceSectionId("");
    }
    if (from === "program" || from === "campus") {
      setBranchId("");
      setBatchId("");
      setSourceClassId("");
      setSourceSectionId("");
    }
    if (from === "branch" || from === "program" || from === "campus") {
      setBatchId("");
      setSourceClassId("");
      setSourceSectionId("");
    }
    if (from === "batch" || from === "branch" || from === "program" || from === "campus") {
      setSourceClassId("");
      setSourceSectionId("");
    }
    if (from === "class") {
      setSourceSectionId("");
    }
    setDestClassId("");
    setDestSectionId("");
    setReassignmentByStudent({});
  }

  function togglePromoted(studentId: string) {
    setPromotedIds((current) => (current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]));
  }

  function selectAllStudents(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPromotedIds(api.students.map((s) => s.id));
  }

  function unselectAllStudents(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPromotedIds([]);
  }

  function initStep4Drafts() {
    if (!sourceAcademicYear || !sourceClassId) return;
    const next: Record<string, ReassignmentDraft> = {};
    for (const student of api.students) {
      if (!promotedIds.includes(student.id)) {
        next[student.id] = { academicYearIndex: sourceAcademicYear, classId: sourceClassId, sectionId: "" };
      }
    }
    setReassignmentByStudent(next);
  }

  function updateReassignment(studentId: string, patch: Partial<ReassignmentDraft>) {
    setReassignmentByStudent((prev) => {
      const row = prev[studentId] ?? { academicYearIndex: sourceAcademicYear ?? 1, classId: sourceClassId, sectionId: "" };
      const merged = { ...row, ...patch };
      if (patch.academicYearIndex !== undefined && patch.academicYearIndex !== row.academicYearIndex) {
        merged.classId = "";
        merged.sectionId = "";
      }
      if (patch.classId !== undefined && patch.classId !== row.classId) {
        merged.sectionId = "";
      }
      return { ...prev, [studentId]: merged };
    });
  }

  async function submitPromotion() {
    if (!step1Complete) {
      showToast("Choose campus, department, branch, batch, class, and section.", "error");
      return;
    }
    if (!api.students.length) {
      showToast("There are no active students in this section.", "error");
      return;
    }
    if (promotedIds.length > 0) {
      if (!canPromoteForward) {
        showToast("This semester pair cannot promote forward; uncheck all students or use only individual reassignments.", "error");
        return;
      }
      if (!destSectionId.trim()) {
        showToast("Choose a destination section for promoted students.", "error");
        return;
      }
    }
    if (!step4ReassignmentsComplete) {
      showToast("Each non-promoted student needs a destination section.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        fromClassId: sourceClassId,
        fromSectionId: sourceSectionId,
        ...(promotedIds.length ? { toSectionId: destSectionId } : {}),
        promotedStudentProfileIds: promotedIds,
        nonPromotedReassignments: nonPromotedStudents.map((s) => ({
          studentProfileId: s.id,
          toSectionId: reassignmentByStudent[s.id]?.sectionId ?? ""
        })),
        idempotencyKey,
        note: note.trim() || undefined
      };
      const result = await api.promoteSelected(body);
      showToast(result.message ?? `Promoted ${result.promoted}, reassigned ${result.reassigned ?? 0}.`);
      setStep(1);
      setPromotedIds([]);
      setReassignmentByStudent({});
      setNote("");
      setIdempotencyKey(safeRandomId("promotion"));
      setDestClassId("");
      setDestSectionId("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Promotion failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PromotionShell title="Promote students" variant="workflow" backHref="/promotion">
      <nav className="promotion-wizard-nav" aria-label="Promotion steps">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`promotion-wizard-step${step === n ? " promotion-wizard-step-active" : ""}`}
            onClick={() => {
              if (n <= step) setStep(n);
            }}
          >
            Step {n}
          </button>
        ))}
      </nav>

      {step === 1 ? (
        <section className="db-card db-form">
          <div className="promotion-form-heading">
            <h2>Step 1 — Current section</h2>
            <p>Select the academic section students are promoted from. Semester pairs follow the branch duration.</p>
          </div>
          <div className="teacher-form-grid">
            <Field label="Campus">
              <PromotionDropdown value={campusId} onChange={(id) => { setCampusId(id); resetHierarchy("campus"); }} options={campusOptions} placeholder="Campus" />
            </Field>
            <Field label="Department">
              <PromotionDropdown
                disabled={!campusId}
                value={programId}
                onChange={(id) => { setProgramId(id); resetHierarchy("program"); }}
                options={programOptions}
                placeholder="Department"
              />
            </Field>
            <Field label="Branch">
              <PromotionDropdown
                disabled={!programId}
                value={branchId}
                onChange={(id) => { setBranchId(id); resetHierarchy("branch"); }}
                options={branchOptions}
                placeholder="Branch"
              />
            </Field>
            <Field label="Batch">
              <PromotionDropdown
                disabled={!branchId}
                value={batchId}
                onChange={(id) => { setBatchId(id); resetHierarchy("batch"); }}
                options={batchOptions}
                placeholder="Batch"
              />
            </Field>
            <Field label="Class">
              <PromotionDropdown
                disabled={!batchId}
                value={sourceClassId}
                onChange={(id) => {
                  setSourceClassId(id);
                  resetHierarchy("class");
                }}
                options={sourceClassOptions}
                placeholder="Class"
              />
            </Field>
            <Field label="Section">
              <PromotionDropdown
                disabled={!sourceClassId}
                value={sourceSectionId}
                onChange={setSourceSectionId}
                options={sourceSectionOptions}
                placeholder="Section"
              />
            </Field>
            <ReadonlyField
              label="Semester"
              value={sourceAcademicYear ? semesterPairLabelForAcademicYear(sourceAcademicYear) : "—"}
            />
          </div>
          <div className="promotion-wizard-actions">
            <button type="button" className="db-submit" disabled={!step1Complete} onClick={() => setStep(2)}>
              Next: Destination
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="db-card db-form">
          <div className="promotion-form-heading">
            <h2>Step 2 — Destination section</h2>
            <p>Campus through batch are fixed from step 1. Only class and section change; the next semester pair is automatic.</p>
          </div>
          <div className="teacher-form-grid">
            <ReadonlyField label="Campus" value={campus ? `${campus.code} — ${campus.name}` : "—"} />
            <ReadonlyField label="Department" value={program ? `${program.code} — ${program.name}` : "—"} />
            <ReadonlyField label="Branch" value={branch ? `${branch.code} — ${branch.name}` : "—"} />
            <ReadonlyField label="Batch" value={batch ? `${batch.startYear}–${batch.endYear}` : "—"} />
            <ReadonlyField label="Semester (next pair)" value={nextPairLabel} />
            <Field label="Class">
              <PromotionDropdown
                disabled={!canPromoteForward || !batchId}
                value={destClassId}
                onChange={(id) => {
                  setDestClassId(id);
                  setDestSectionId("");
                }}
                options={destClassOptions}
                placeholder="Destination class"
                required={canPromoteForward}
              />
            </Field>
            <Field label="Section">
              <PromotionDropdown
                disabled={!canPromoteForward || !destClassId}
                value={destSectionId}
                onChange={setDestSectionId}
                options={destSectionOptions}
                placeholder="Destination section"
                required={canPromoteForward}
              />
            </Field>
          </div>
          {!canPromoteForward && sourceAcademicYear ? (
            <p className="db-empty">
              This pair is in the final academic year: there is no next semester pair for standard promotion. Continue to individually reassign every student in steps 3–4.
            </p>
          ) : null}
          <div className="promotion-wizard-actions">
            <button type="button" className="promotion-wizard-back" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="db-submit" disabled={!step2Complete} onClick={() => setStep(3)}>
              Next: Students
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="db-card db-form">
          <div className="db-result-head">
            <div>
              <h2>Step 3 — Student selection</h2>
              <p className="db-empty">
                {promotedIds.length} promoted / {api.students.length} total. Uncheck anyone who should stay or be reassigned manually in step 4.
              </p>
            </div>
            <div className="db-export-actions">
              <button type="button" onClick={selectAllStudents}>
                <CheckSquare size={14} /> Select all
              </button>
              <button type="button" onClick={unselectAllStudents}>
                <Square size={14} /> Unselect all
              </button>
            </div>
          </div>
          <PromotionStudentList students={api.students} promotedIds={promotedIds} toggle={togglePromoted} />
          <label className="db-field" htmlFor="promotion-note">
            <span>Note (audit)</span>
            <input id="promotion-note" className="db-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
          <div className="promotion-wizard-actions">
            <button type="button" className="promotion-wizard-back" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="button"
              className="db-submit"
              disabled={!step3Complete}
              onClick={() => {
                initStep4Drafts();
                setStep(4);
              }}
            >
              Next: Non-promoted
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="db-card db-form">
          <div className="promotion-form-heading">
            <h2>Step 4 — Non-promoted students</h2>
            <p>Each unchecked student has their own destination. Campus through batch stay fixed; adjust semester pair, class, and section.</p>
          </div>

          {nonPromotedStudents.length === 0 ? (
            <p className="db-empty">Everyone is marked for promotion. You can submit without individual reassignments.</p>
          ) : (
            <div className="promotion-card-grid">
              {nonPromotedStudents.map((student) => (
                <NonPromotedCard
                  key={student.id}
                  student={student}
                  draft={reassignmentByStudent[student.id] ?? { academicYearIndex: sourceAcademicYear ?? 1, classId: "", sectionId: "" }}
                  campusLabel={campus ? `${campus.code} — ${campus.name}` : "—"}
                  programLabel={program ? `${program.code} — ${program.name}` : "—"}
                  branchLabel={branch ? `${branch.code} — ${branch.name}` : "—"}
                  batchLabel={batch ? `${batch.startYear}–${batch.endYear}` : "—"}
                  pairOptions={pairOptions}
                  onChange={(patch) => updateReassignment(student.id, patch)}
                  loadClasses={loadCardClasses}
                  loadSections={loadCardSections}
                />
              ))}
            </div>
          )}

          <div className="promotion-wizard-actions">
            <button type="button" className="promotion-wizard-back" onClick={() => setStep(3)}>
              Back
            </button>
            <button
              type="button"
              className="db-submit"
              disabled={submitting || !submitReady}
              onClick={() => void submitPromotion()}
            >
              {submitting ? "Submitting…" : "Complete promotion"}
            </button>
          </div>
        </section>
      ) : null}
    </PromotionShell>
  );
}

function NonPromotedCard({
  campusLabel,
  programLabel,
  branchLabel,
  batchLabel,
  draft,
  loadClasses,
  loadSections,
  onChange,
  pairOptions,
  student
}: {
  student: PromotionStudent;
  draft: ReassignmentDraft;
  campusLabel: string;
  programLabel: string;
  branchLabel: string;
  batchLabel: string;
  pairOptions: [string, string][];
  onChange: (patch: Partial<ReassignmentDraft>) => void;
  loadClasses: (year: number) => Promise<PromotionClass[]>;
  loadSections: (classId: string) => Promise<PromotionSection[]>;
}) {
  const [classList, setClassList] = useState<PromotionClass[]>([]);
  const [sectionList, setSectionList] = useState<PromotionSection[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadClasses(draft.academicYearIndex).then((items) => {
      if (!cancelled) setClassList(items);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.academicYearIndex, loadClasses]);

  useEffect(() => {
    if (!draft.classId) {
      setSectionList([]);
      return;
    }
    let cancelled = false;
    void loadSections(draft.classId).then((items) => {
      if (!cancelled) setSectionList(items);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.classId, loadSections]);

  const classOptions = classList.map((c) => [c.id, `${c.name} (semester ${c.semesterNumber})`] as [string, string]);
  const sectionOptions = sectionList.map((s) => [s.id, s.name] as [string, string]);

  return (
    <article className="db-card db-form promotion-nonpromoted-card">
      <h3 className="promotion-nonpromoted-title">
        {student.fullName} <small>{student.rollNumber}</small>
      </h3>
      <div className="teacher-form-grid">
        <ReadonlyField label="Campus" value={campusLabel} />
        <ReadonlyField label="Department" value={programLabel} />
        <ReadonlyField label="Branch" value={branchLabel} />
        <ReadonlyField label="Batch" value={batchLabel} />
        <Field label="Semester">
          <PromotionDropdown
            disabled={pairOptions.length === 0}
            value={String(draft.academicYearIndex)}
            onChange={(v) => onChange({ academicYearIndex: Number(v) })}
            options={pairOptions}
            placeholder="Semester pair"
          />
        </Field>
        <Field label="Class">
          <PromotionDropdown
            disabled={pairOptions.length === 0 || !draft.academicYearIndex}
            value={draft.classId}
            onChange={(id) => onChange({ classId: id })}
            options={classOptions}
            placeholder="Class"
          />
        </Field>
        <Field label="Section">
          <PromotionDropdown
            disabled={!draft.classId}
            value={draft.sectionId}
            onChange={(id) => onChange({ sectionId: id })}
            options={sectionOptions}
            placeholder="Section"
          />
        </Field>
      </div>
    </article>
  );
}

function usePromotionWizardApi() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [semesterPairs, setSemesterPairs] = useState<SemesterPairsPayload | null>(null);
  const [sourceClasses, setSourceClasses] = useState<PromotionClass[]>([]);
  const [destClasses, setDestClasses] = useState<PromotionClass[]>([]);
  const [sourceSections, setSourceSections] = useState<PromotionSection[]>([]);
  const [destSections, setDestSections] = useState<PromotionSection[]>([]);
  const [students, setStudents] = useState<PromotionStudent[]>([]);

  const fetchJson = useCallback(
    async <T,>(path: string) => {
      const response = await authFetch(path);
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  const sendJson = useCallback(
    async <T,>(path: string, body: unknown) => {
      const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw await responseError(response);
      return (await response.json()) as T;
    },
    [authFetch]
  );

  const fetchClasses = useCallback(
    async (params: URLSearchParams) => fetchJson<PaginatedResponse<PromotionClass>>(`/api/promotion/classes?${params.toString()}`),
    [fetchJson]
  );

  const fetchSections = useCallback(
    async (params: URLSearchParams) => fetchJson<PaginatedResponse<PromotionSection>>(`/api/promotion/sections?${params.toString()}`),
    [fetchJson]
  );

  const loadCampuses = useCallback(async () => {
    try {
      const page = await fetchJson<PaginatedResponse<Campus>>("/api/core/campuses?page=1&pageSize=100");
      setCampuses(page.items);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load campuses", "error");
    }
  }, [fetchJson, showToast]);

  const resetPrograms = useCallback(() => {
    setPrograms([]);
    setBranches([]);
    setBatches([]);
    setSemesterPairs(null);
  }, []);

  const loadPrograms = useCallback(
    async (cId: string) => {
      try {
        const page = await fetchJson<PaginatedResponse<Program>>(`/api/core/programs?page=1&pageSize=100&campusId=${encodeURIComponent(cId)}`);
        setPrograms(
          programsForOperationalCampus(page.items as ProgramPicker[], cId, campuses as CampusPicker[]) as Program[]
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load departments", "error");
      }
    },
    [fetchJson, showToast]
  );

  const resetBranches = useCallback(() => {
    setBranches([]);
    setBatches([]);
    setSemesterPairs(null);
  }, []);

  const loadBranches = useCallback(
    async (pId: string) => {
      try {
        const page = await fetchJson<PaginatedResponse<Branch>>(`/api/core/branches?page=1&pageSize=100&programId=${encodeURIComponent(pId)}`);
        setBranches(page.items);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load branches", "error");
      }
    },
    [fetchJson, showToast]
  );

  const resetBatches = useCallback(() => {
    setBatches([]);
    setSemesterPairs(null);
  }, []);

  const loadBatches = useCallback(
    async (bId: string) => {
      try {
        const page = await fetchJson<PaginatedResponse<Batch>>(`/api/core/batches?page=1&pageSize=100&branchId=${encodeURIComponent(bId)}`);
        setBatches(page.items);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load batches", "error");
      }
    },
    [fetchJson, showToast]
  );

  const loadSemesterPairs = useCallback(
    async (bId: string) => {
      try {
        const payload = await fetchJson<SemesterPairsPayload>(`/api/promotion/semester-pairs?branchId=${encodeURIComponent(bId)}`);
        setSemesterPairs(payload);
      } catch (error) {
        setSemesterPairs(null);
        showToast(error instanceof Error ? error.message : "Unable to load semester pairs", "error");
      }
    },
    [fetchJson, showToast]
  );

  const clearSourceClasses = useCallback(() => setSourceClasses([]), []);
  const clearDestClasses = useCallback(() => setDestClasses([]), []);
  const clearSourceSections = useCallback(() => setSourceSections([]), []);
  const clearDestSections = useCallback(() => setDestSections([]), []);
  const clearStudents = useCallback(() => setStudents([]), []);

  const listClassesForBatchYear = useCallback(
    async (batchKey: string, year: number) => {
      const params = new URLSearchParams({ page: "1", pageSize: "100", batchId: batchKey, academicYearIndex: String(year) });
      return (await fetchClasses(params)).items;
    },
    [fetchClasses]
  );

  const listSectionsForClass = useCallback(
    async (classId: string) => {
      const params = new URLSearchParams({ page: "1", pageSize: "100", classId });
      return (await fetchSections(params)).items;
    },
    [fetchSections]
  );

  const loadClassesForBatch = useCallback(
    async (batchKey: string, target: "source" | "dest", academicYear?: number) => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "100", batchId: batchKey });
        if (academicYear !== undefined) params.set("academicYearIndex", String(academicYear));
        const page = await fetchClasses(params);
        if (target === "source") setSourceClasses(page.items);
        else setDestClasses(page.items);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load classes", "error");
      }
    },
    [fetchClasses, showToast]
  );

  const loadSections = useCallback(
    async (classId: string, target: "source" | "dest") => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "100", classId });
        const page = await fetchSections(params);
        if (target === "source") setSourceSections(page.items);
        else setDestSections(page.items);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load sections", "error");
      }
    },
    [fetchSections, showToast]
  );

  const loadAllStudents = useCallback(
    async (classId: string, sectionId: string) => {
      const all: PromotionStudent[] = [];
      let page = 1;
      const pageSize = 100;
      try {
        while (true) {
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), classId, sectionId });
          const res = await fetchJson<PaginatedResponse<PromotionStudent>>(`/api/promotion/students?${params.toString()}`);
          all.push(...res.items);
          if (all.length >= res.total || res.items.length === 0) break;
          page += 1;
        }
        setStudents(all);
        return all;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load students", "error");
        setStudents([]);
        return [];
      }
    },
    [fetchJson, showToast]
  );

  const promoteSelected = useCallback(
    (body: {
      fromClassId: string;
      fromSectionId: string;
      toSectionId?: string;
      promotedStudentProfileIds: string[];
      nonPromotedReassignments: { studentProfileId: string; toSectionId: string }[];
      idempotencyKey: string;
      note?: string;
    }) => sendJson<PromotionWorkflowResult>("/api/promotion/promote", body),
    [sendJson]
  );

  useEffect(() => {
    return () => {
      setStudents([]);
      setSourceClasses([]);
      setDestClasses([]);
      setSourceSections([]);
      setDestSections([]);
      setPrograms([]);
      setBranches([]);
      setBatches([]);
      setSemesterPairs(null);
      setCampuses([]);
    };
  }, []);

  return {
    batches,
    branches,
    campuses,
    clearDestClasses,
    clearDestSections,
    clearSourceClasses,
    clearSourceSections,
    clearStudents,
    destClasses,
    destSections,
    listClassesForBatchYear,
    listSectionsForClass,
    loadAllStudents,
    loadBatches,
    loadBranches,
    loadCampuses,
    loadClassesForBatch,
    loadPrograms,
    loadSections,
    loadSemesterPairs,
    programs,
    promoteSelected,
    resetBatches,
    resetBranches,
    resetPrograms,
    semesterPairs,
    sourceClasses,
    sourceSections,
    students
  };
}

function PromotionShell({
  children,
  title,
  variant = "workflow",
  backHref
}: {
  children: ReactNode;
  title: string;
  variant?: "main" | "workflow";
  backHref?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className="db-workflow min-h-screen promotion-workflow-layout">
      <header className="db-workflow-header">
        <div className="db-header-left">
          {variant === "main" ? (
            <AdminWorkflowMenuButton />
          ) : backHref ? (
            <Link to={backHref} className="db-icon-button" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" className="db-icon-button" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1>{title}</h1>
        </div>
        <div className="db-header-actions">
          <ProfileMenuButton />
        </div>
      </header>
      <div className="db-workflow-body promotion-body">{children}</div>
    </main>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="db-field"><span>{label}</span>{children}</label>;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      <div className="db-input db-input-readonly" role="textbox" aria-readonly>
        {value}
      </div>
    </label>
  );
}

function PromotionStudentList({ promotedIds, students, toggle }: { students: PromotionStudent[]; promotedIds: string[]; toggle: (id: string) => void }) {
  if (!students.length) return <p className="db-empty">No active students in this section.</p>;
  return (
    <div className="promotion-student-list">
      <div className="promotion-student-head">
        <span>Promote</span>
        <span>Student</span>
        <span>Roll</span>
        <span>Semester</span>
        <span>Class</span>
        <span>Section</span>
      </div>
      {students.map((student) => (
        <label key={student.id} className="promotion-student-row" htmlFor={`promotion-student-${student.id}`}>
          <input id={`promotion-student-${student.id}`} type="checkbox" checked={promotedIds.includes(student.id)} onChange={() => toggle(student.id)} />
          <span>{student.fullName}</span>
          <span>{student.rollNumber}</span>
          <span>{student.currentSemester}</span>
          <span>{student.currentClass}</span>
          <span>{student.currentSection}</span>
        </label>
      ))}
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

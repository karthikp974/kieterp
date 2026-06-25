import { useMemo } from "react";
import { FormSelect, type FormSelectOption } from "../shared/FormSelect";

type Campus = { id: string; code: string; name: string };
type Program = { id: string; code: string; name: string; campusId: string };
type Branch = { id: string; code: string; name: string; programId: string };
type Batch = { id: string; batchCode: string; startYear: number; endYear: number };
type AcademicClass = { id: string; label: string; semesterNumber: number };
type Section = { id: string; name: string; code: string };

export type Audience = "STUDENTS" | "TEACHERS" | "BOTH";
export type TeacherRoleFilter = "ALL" | "HTPO" | "CTPO" | "STPO";

export type StudentScope = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  sectionId: string;
};

export type TeacherScope = {
  campusId: string;
  programId: string;
  branchId: string;
};

export type StructureLists = {
  campuses: Campus[];
  programs: Program[];
  branches: Branch[];
  batches: Batch[];
  classes: AcademicClass[];
  sections: Section[];
  campusesLoading?: boolean;
  setPrograms: (v: Program[]) => void;
  setBranches: (v: Branch[]) => void;
  setBatches: (v: Batch[]) => void;
  setClasses: (v: AcademicClass[]) => void;
  setSections: (v: Section[]) => void;
  loadPrograms: (campusId: string) => Promise<void>;
  loadBranches: (programId: string, campusId: string) => Promise<void>;
  loadBatches: (branchId: string, programId: string, campusId: string) => Promise<void>;
  loadClasses: (batchId: string) => Promise<void>;
  loadSections: (classId: string) => Promise<void>;
};

function Field({ children, label, hint }: { children: React.ReactNode; label: string; hint?: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
      {hint ? <span className="db-field-hint">{hint}</span> : null}
    </label>
  );
}

function campusOptions(campuses: Campus[], loading?: boolean): readonly FormSelectOption[] {
  if (loading) return [["", "Loading campuses…"]];
  if (!campuses.length) return [["", "No campuses — run seed or add in Department & Branch"]];
  const rows: FormSelectOption[] = [["", "Select campus"]];
  for (const c of campuses) rows.push([c.id, `${c.code} — ${c.name}`]);
  return rows;
}

function scopedOptions(items: FormSelectOption[], emptyLabel: string): readonly FormSelectOption[] {
  return [["", emptyLabel], ...items];
}

export function validateAnnouncementTargeting(
  audience: Audience,
  studentScope: StudentScope,
  teacherScope: TeacherScope
): string | null {
  if (audience !== "TEACHERS" && !studentScope.campusId) {
    return "Select a campus for students.";
  }
  if (audience !== "STUDENTS" && !teacherScope.campusId) {
    return "Select a campus for teachers.";
  }
  return null;
}

export function deepestStudentPayload(s: StudentScope): Record<string, string> {
  if (s.sectionId) return { sectionId: s.sectionId };
  if (s.classId) return { classId: s.classId };
  if (s.batchId) return { batchId: s.batchId };
  if (s.branchId) return { branchId: s.branchId };
  if (s.programId) return { programId: s.programId };
  if (s.campusId) return { campusId: s.campusId };
  return {};
}

export function teacherTargetingPayload(scope: TeacherScope, roleFilter: TeacherRoleFilter) {
  return {
    teacherRoleFilter: roleFilter,
    teacherCampusId: scope.campusId || undefined,
    teacherProgramId: scope.programId || undefined,
    teacherBranchId: scope.branchId || undefined
  };
}

const AUDIENCE_OPTIONS: readonly FormSelectOption[] = [
  ["STUDENTS", "Students"],
  ["TEACHERS", "Teachers"],
  ["BOTH", "Both"]
];

const ROLE_OPTIONS: readonly FormSelectOption[] = [
  ["ALL", "All roles"],
  ["HTPO", "HTPO only"],
  ["CTPO", "CTPO only"],
  ["STPO", "STPO only"]
];

export function AnnouncementTargetingForm({
  audience,
  setAudience,
  studentScope,
  setStudentScope,
  teacherScope,
  setTeacherScope,
  teacherRoleFilter,
  setTeacherRoleFilter,
  studentStructure,
  teacherStructure
}: {
  audience: Audience;
  setAudience: (a: Audience) => void;
  studentScope: StudentScope;
  setStudentScope: (next: StudentScope | ((prev: StudentScope) => StudentScope)) => void;
  teacherScope: TeacherScope;
  setTeacherScope: (next: TeacherScope | ((prev: TeacherScope) => TeacherScope)) => void;
  teacherRoleFilter: TeacherRoleFilter;
  setTeacherRoleFilter: (r: TeacherRoleFilter) => void;
  studentStructure: StructureLists;
  teacherStructure: StructureLists;
}) {
  const showStudent = audience === "STUDENTS" || audience === "BOTH";
  const showTeacher = audience === "TEACHERS" || audience === "BOTH";

  const studentCampusOptions = useMemo(
    () => campusOptions(studentStructure.campuses, studentStructure.campusesLoading),
    [studentStructure.campuses, studentStructure.campusesLoading]
  );
  const teacherCampusOptions = useMemo(
    () => campusOptions(teacherStructure.campuses, teacherStructure.campusesLoading),
    [teacherStructure.campuses, teacherStructure.campusesLoading]
  );

  const studentProgramOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = studentStructure.programs.map((p) => [p.id, `${p.code} — ${p.name}`]);
    return scopedOptions(rows, "All departments on this campus");
  }, [studentStructure.programs]);

  const studentBranchOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = studentStructure.branches.map((b) => [b.id, `${b.code} — ${b.name}`]);
    return scopedOptions(rows, "All branches in this department");
  }, [studentStructure.branches]);

  const studentBatchOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = studentStructure.batches.map((b) => [b.id, `${b.batchCode} (${b.startYear}–${b.endYear})`]);
    return scopedOptions(rows, "All batches in this branch");
  }, [studentStructure.batches]);

  const studentClassOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = studentStructure.classes.map((c) => [c.id, `Sem ${c.semesterNumber} — ${c.label}`]);
    return scopedOptions(rows, "All classes in this batch");
  }, [studentStructure.classes]);

  const studentSectionOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = studentStructure.sections.map((s) => [s.id, `${s.name} (${s.code})`]);
    return scopedOptions(rows, "All sections in this class");
  }, [studentStructure.sections]);

  const teacherProgramOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = teacherStructure.programs.map((p) => [p.id, `${p.code} — ${p.name}`]);
    return scopedOptions(rows, "All departments on this campus");
  }, [teacherStructure.programs]);

  const teacherBranchOptions = useMemo((): readonly FormSelectOption[] => {
    const rows: FormSelectOption[] = teacherStructure.branches.map((b) => [b.id, `${b.code} — ${b.name}`]);
    return scopedOptions(rows, "All branches in this department");
  }, [teacherStructure.branches]);

  return (
    <div className="db-card db-form ann-content-card grid gap-4">
      <Field label="Select audience">
        <FormSelect value={audience} options={AUDIENCE_OPTIONS} onChange={(v) => setAudience(v as Audience)} required />
      </Field>

      {showStudent ? (
        <div className="ann-scope-card grid gap-3">
          <p>Student targeting — pick campus, then narrow by department, branch, batch, class, or section</p>
          <Field label="Campus">
            <FormSelect
              value={studentScope.campusId}
              options={studentCampusOptions}
              onChange={async (campusId) => {
                setStudentScope({ campusId, programId: "", branchId: "", batchId: "", classId: "", sectionId: "" });
                studentStructure.setPrograms([]);
                studentStructure.setBranches([]);
                studentStructure.setBatches([]);
                studentStructure.setClasses([]);
                studentStructure.setSections([]);
                if (campusId) await studentStructure.loadPrograms(campusId);
              }}
              required
              disabled={studentStructure.campusesLoading || !studentStructure.campuses.length}
            />
          </Field>
          <Field label="Department">
            <FormSelect
              value={studentScope.programId}
              options={studentProgramOptions}
              disabled={!studentScope.campusId}
              onChange={async (programId) => {
                setStudentScope((prev) => ({ ...prev, programId, branchId: "", batchId: "", classId: "", sectionId: "" }));
                studentStructure.setBranches([]);
                studentStructure.setBatches([]);
                studentStructure.setClasses([]);
                studentStructure.setSections([]);
                if (programId && studentScope.campusId) await studentStructure.loadBranches(programId, studentScope.campusId);
              }}
            />
          </Field>
          <Field label="Branch">
            <FormSelect
              value={studentScope.branchId}
              options={studentBranchOptions}
              disabled={!studentScope.programId}
              onChange={async (branchId) => {
                setStudentScope((prev) => ({ ...prev, branchId, batchId: "", classId: "", sectionId: "" }));
                studentStructure.setBatches([]);
                studentStructure.setClasses([]);
                studentStructure.setSections([]);
                if (branchId && studentScope.programId && studentScope.campusId) {
                  await studentStructure.loadBatches(branchId, studentScope.programId, studentScope.campusId);
                }
              }}
            />
          </Field>
          <Field label="Batch">
            <FormSelect
              value={studentScope.batchId}
              options={studentBatchOptions}
              disabled={!studentScope.branchId}
              onChange={async (batchId) => {
                setStudentScope((prev) => ({ ...prev, batchId, classId: "", sectionId: "" }));
                studentStructure.setClasses([]);
                studentStructure.setSections([]);
                if (batchId) await studentStructure.loadClasses(batchId);
              }}
            />
          </Field>
          <Field label="Class">
            <FormSelect
              value={studentScope.classId}
              options={studentClassOptions}
              disabled={!studentScope.batchId}
              onChange={async (classId) => {
                setStudentScope((prev) => ({ ...prev, classId, sectionId: "" }));
                studentStructure.setSections([]);
                if (classId) await studentStructure.loadSections(classId);
              }}
            />
          </Field>
          <Field label="Section">
            <FormSelect
              value={studentScope.sectionId}
              options={studentSectionOptions}
              disabled={!studentScope.classId}
              onChange={(sectionId) => setStudentScope((prev) => ({ ...prev, sectionId }))}
            />
          </Field>
        </div>
      ) : null}

      {showTeacher ? (
        <div className="ann-scope-card grid gap-3">
          <p>Teacher targeting — pick campus, then department or branch if needed</p>
          <Field label="Teacher role">
            <FormSelect value={teacherRoleFilter} options={ROLE_OPTIONS} onChange={(v) => setTeacherRoleFilter(v as TeacherRoleFilter)} required />
          </Field>
          <Field label="Campus">
            <FormSelect
              value={teacherScope.campusId}
              options={teacherCampusOptions}
              onChange={async (campusId) => {
                setTeacherScope({ campusId, programId: "", branchId: "" });
                teacherStructure.setPrograms([]);
                teacherStructure.setBranches([]);
                if (campusId) await teacherStructure.loadPrograms(campusId);
              }}
              required
              disabled={teacherStructure.campusesLoading || !teacherStructure.campuses.length}
            />
          </Field>
          <Field label="Department">
            <FormSelect
              value={teacherScope.programId}
              options={teacherProgramOptions}
              disabled={!teacherScope.campusId}
              onChange={async (programId) => {
                setTeacherScope((prev) => ({ ...prev, programId, branchId: "" }));
                teacherStructure.setBranches([]);
                if (programId && teacherScope.campusId) await teacherStructure.loadBranches(programId, teacherScope.campusId);
              }}
            />
          </Field>
          <Field label="Branch">
            <FormSelect
              value={teacherScope.branchId}
              options={teacherBranchOptions}
              disabled={!teacherScope.programId}
              onChange={(branchId) => setTeacherScope((prev) => ({ ...prev, branchId }))}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

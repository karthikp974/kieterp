import type { StudentMySubjectCard } from "./student-subjects-types";

type Props = {
  subject: StudentMySubjectCard;
  onViewSyllabus: () => void;
  syllabusLoading?: boolean;
};

export function StudentSubjectProgressCard({ subject, onViewSyllabus, syllabusLoading }: Props) {
  const pct = Math.min(100, Math.max(0, subject.progressPercent));
  const teacher = subject.teacherName?.trim() || "Not assigned";
  const unitsLabel =
    subject.hasSyllabus && subject.totalUnits > 0
      ? `${subject.completedUnits} / ${subject.totalUnits} units completed`
      : subject.hasSyllabus
        ? "No units yet"
        : "Syllabus not published";

  return (
    <article className="sp-subj-card">
      <h2 className="sp-subj-card-title">{subject.name}</h2>
      <p className="sp-subj-card-code">{subject.code}</p>
      <p className="sp-subj-card-teacher">
        <span className="sp-subj-card-teacher-label">Teacher</span>
        <strong>{teacher}</strong>
      </p>

      <div className="sp-subj-progress-block">
        <div className="sp-subj-progress-head">
          <span className="sp-subj-progress-label">Syllabus completion</span>
          <strong className="sp-subj-progress-pct">{subject.hasSyllabus ? `${pct}%` : "—"}</strong>
        </div>
        <div className="sp-subj-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="sp-subj-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="sp-subj-progress-meta">{unitsLabel}</p>
      </div>

      <button type="button" className="sp-subj-view-btn" disabled={syllabusLoading} onClick={onViewSyllabus}>
        View syllabus
      </button>
    </article>
  );
}

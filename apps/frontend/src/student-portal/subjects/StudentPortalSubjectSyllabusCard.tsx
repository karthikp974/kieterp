import type { StudentSyllabusDetailResponse } from "./student-subjects-types";

type Props = Pick<
  StudentSyllabusDetailResponse,
  "subject" | "progressPercent" | "completedUnits" | "totalUnits" | "teacherName" | "completedTopics" | "totalTopics"
>;

export function StudentPortalSubjectSyllabusCard({
  subject,
  progressPercent,
  completedUnits,
  totalUnits,
  completedTopics,
  totalTopics,
  teacherName
}: Props) {
  const pct = Math.min(100, Math.max(0, progressPercent));
  const teacher = teacherName?.trim() || "—";

  return (
    <article className="sp-syl-subject-card" aria-labelledby="sp-syl-subject-title">
      <div className="sp-syl-subject-card-top">
        <div className="sp-syl-subject-name-wrap">
          <h2 id="sp-syl-subject-title" className="sp-syl-subject-name">
            {subject.name}
          </h2>
          <p className="sp-syl-subject-code">{subject.code}</p>
        </div>
        <div className="sp-syl-subject-progress-wrap">
          <p className="sp-syl-pct-label">Syllabus completion</p>
          <p className="sp-syl-pct-value">{pct}%</p>
          <div className="sp-syl-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="sp-syl-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="sp-syl-subject-card-foot">
        <p className="sp-syl-units-count">
          <span className="sp-syl-units-count-label">Units completed</span>
          <strong>
            {completedUnits} / {totalUnits}
          </strong>
          <span className="sp-syl-units-count-meta">
            {" "}
            ({completedTopics}/{totalTopics} topics)
          </span>
        </p>
        <p className="sp-syl-teacher">
          <span className="sp-syl-teacher-label">Subject teacher</span>
          <strong>{teacher}</strong>
        </p>
      </div>
    </article>
  );
}

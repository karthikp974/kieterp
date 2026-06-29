import { ReactNode } from "react";
import { SafeActionButton } from "../../shared/SafeActionButton";
import { formatIstLocaleDate } from "../../shared/ist-time";
import { useTeacherPortal } from "../teacher-portal-context";
import type { TeacherAssignment, TeacherDashboard } from "../teacher-portal-types";

export function TeacherDashboardHome({
  dashboard,
  refreshDashboard,
  showTodayTimetable = true,
  hideCtpoAssignmentCards = false
}: {
  dashboard: TeacherDashboard | null;
  refreshDashboard: () => Promise<void>;
  showTodayTimetable?: boolean;
  hideCtpoAssignmentCards?: boolean;
}) {
  const { hasModule } = useTeacherPortal();
  const showAnnouncements = hasModule("announcements");

  if (!dashboard) return <p className="db-empty">Loading teacher workspace…</p>;

  const assignments = hideCtpoAssignmentCards
    ? dashboard.assignments.filter((a) => a.role !== "CTPO")
    : dashboard.assignments;

  return (
    <div className="grid gap-5">
      {assignments.length ? (
      <section className="grid gap-4 lg:grid-cols-3 [&>.db-section]:mt-0">
        {assignments.map((assignment) => (
          <section key={assignment.id} className="db-section">
            <h2>{assignment.role} assignment</h2>
            <p className="mb-3 text-sm leading-snug portal-text-muted">{roleDescription(assignment.role)}</p>
            <span className="mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold portal-role-pill">
              {assignment.scopeLabel}
            </span>
            <ScopeLines assignment={assignment} />
          </section>
        ))}
      </section>
      ) : !hideCtpoAssignmentCards ? (
        <p className="db-empty">No active teacher assignments yet.</p>
      ) : null}
      {showTodayTimetable || showAnnouncements ? (
      <section className={`grid gap-4 ${showTodayTimetable && showAnnouncements ? "xl:grid-cols-2" : ""} [&>.db-section]:mt-0`}>
        {showTodayTimetable ? (
        <TeacherPanel title="Today timetable" action={<SafeActionButton run={refreshDashboard}>Refresh</SafeActionButton>}>
          {dashboard.todayTimetable.map((slot) => (
            <div className="portal-list-row border-b py-3 text-sm last:border-b-0" key={slot.id}>
              <p className="font-extrabold portal-text-strong">
                {slot.time} / {slot.structure.section} / Sem {slot.structure.semester}
              </p>
              <p className="portal-text-muted">
                {slot.structure.subject} / {slot.structure.branch}
                {slot.room ? ` / Room ${slot.room}` : ""}
              </p>
            </div>
          ))}
          {!dashboard.todayTimetable.length ? <p className="text-sm portal-text-muted">No classes scheduled today.</p> : null}
        </TeacherPanel>
        ) : null}
        {showAnnouncements ? (
          <TeacherPanel title="Recent announcements">
            {dashboard.announcements.map((announcement) => (
              <div className="portal-list-row border-b py-3 text-sm last:border-b-0" key={announcement.id}>
                <p className="font-bold portal-text-strong">{announcement.title}</p>
                <p className="text-xs portal-text-muted">
                  {announcement.audience}
                  {announcement.publishedAt ? ` / ${formatIstLocaleDate(announcement.publishedAt)}` : ""}
                </p>
              </div>
            ))}
            {!dashboard.announcements.length ? <p className="text-sm portal-text-muted">No announcements visible in your scope.</p> : null}
          </TeacherPanel>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function TeacherPanel({ action, children, title }: { action?: ReactNode; children: ReactNode; title: string }) {
  return (
    <section className="db-section">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ScopeLines({ assignment }: { assignment: TeacherAssignment }) {
  const rows = [
    ["Campus", assignment.campus ? `${assignment.campus.code} - ${assignment.campus.name}` : null],
    ["Department", assignment.department ? `${assignment.department.code} - ${assignment.department.name}` : null],
    ["Branch", assignment.branch ? `${assignment.branch.code} - ${assignment.branch.name}` : null],
    ["Batch", assignment.batch ? `${assignment.batch.startYear}-${assignment.batch.endYear}` : null],
    ["Class", assignment.class ? `${assignment.class.label} / Sem ${assignment.class.semesterNumber}` : null],
    ["Section", assignment.section?.name ?? null],
    ["Subject", assignment.subject ? `${assignment.subject.code} - ${assignment.subject.name}` : null]
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return (
    <div className="grid gap-2 text-sm">
      {rows.map(([label, value]) => (
        <p key={label} className="portal-scope-row flex justify-between gap-3 border-b pb-1 portal-text-muted last:border-b-0">
          <span className="font-bold">{label}</span>
          <span className="text-right font-semibold portal-text-strong">{value}</span>
        </p>
      ))}
    </div>
  );
}

function roleDescription(role: TeacherAssignment["role"]) {
  if (role === "STPO") return "Subject teacher — timetable and syllabus for your assigned subject.";
  if (role === "CTPO") return "Class teacher — section operations, syllabus, attendance, teams, and more.";
  return "Head teacher — branch-level academic leadership and reporting.";
}

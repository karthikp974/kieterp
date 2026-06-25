import { SafeActionButton } from "../shared/SafeActionButton";
import type { TeacherDashboard } from "./teacher-portal-types";
import { TpCard, TpCardHead } from "./teacher-portal-ui";

export function TeacherTodayTimetableCard({
  slots,
  refreshDashboard,
  className = "htpo-timetable-card"
}: {
  slots: TeacherDashboard["todayTimetable"];
  refreshDashboard: () => Promise<void>;
  className?: string;
}) {
  return (
    <TpCard className={className}>
      <TpCardHead
        title="Today timetable"
        actions={
          <SafeActionButton className="db-wf-btn db-wf-btn--primary htpo-timetable-refresh" run={refreshDashboard}>
            Refresh
          </SafeActionButton>
        }
      />
      {slots.length ? (
        <div className="htpo-timetable-list">
          {slots.map((slot) => (
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
        </div>
      ) : (
        <p className="htpo-timetable-empty">No classes scheduled today.</p>
      )}
    </TpCard>
  );
}

import { SafeActionButton } from "../../shared/SafeActionButton";
import { HtpoSupervisionSectionsCard } from "../HtpoSupervisionSectionsCard";
import { TeacherTodayTimetableCard } from "../TeacherTodayTimetableCard";
import type { TeacherDashboard } from "../teacher-portal-types";
import { TpKpi, TpKpiGrid } from "../teacher-portal-ui";

export function HtpoDashboard({
  dashboard,
  refreshDashboard
}: {
  dashboard: TeacherDashboard;
  refreshDashboard: () => Promise<void>;
}) {
  const overview = dashboard.htpoOverview;
  const htpoAssignment = dashboard.assignments.find((a) => a.role === "HTPO");

  if (!overview) {
    return (
      <div className="htpo-dashboard">
        <header className="htpo-dashboard-hero">
          <h1 className="htpo-dashboard-title">Welcome back, {dashboard.teacher.fullName}</h1>
          <p className="htpo-dashboard-subtitle">
            {htpoAssignment?.department?.name ?? "Your department"} · HTPO dashboard
          </p>
        </header>
        <section className="db-section">
          <h2>HTPO overview could not load</h2>
          <p className="db-muted">
            Stop the backend terminal (Ctrl+C), run <code>npm run dev</code> again in <code>apps/backend</code>, then
            click Refresh here.
          </p>
          <SafeActionButton className="db-wf-btn db-wf-btn--primary mt-3" run={refreshDashboard}>
            Refresh
          </SafeActionButton>
        </section>
      </div>
    );
  }

  const sectionWord = overview.sectionCount === 1 ? "section" : "sections";

  return (
    <div className="htpo-dashboard">
      <header className="htpo-dashboard-hero">
        <h1 className="htpo-dashboard-title">Welcome back, {dashboard.teacher.fullName}</h1>
        <p className="htpo-dashboard-subtitle">
          {overview.departmentLabel} · {overview.sectionCount} {sectionWord} under your supervision
        </p>
      </header>

      <TpKpiGrid>
        <TpKpi
          label="Total students"
          value={overview.totalStudents}
          sub={overview.sectionCount ? `Across ${overview.sectionCount} ${sectionWord}` : undefined}
        />
        <TpKpi
          label="Avg attendance"
          value={overview.avgAttendancePercent == null ? "—" : `${overview.avgAttendancePercent}%`}
          sub="This week"
        />
        <TpKpi label="Fee pending" value={overview.feePendingCount} sub="Students with dues" />
        <TpKpi label="Open feedback" value={overview.openFeedbackCount} sub="Needs your attention" />
      </TpKpiGrid>

      <HtpoSupervisionSectionsCard sections={overview.supervisionSections} returnTo="/teacher" />

      <TeacherTodayTimetableCard slots={dashboard.todayTimetable} refreshDashboard={refreshDashboard} />
    </div>
  );
}

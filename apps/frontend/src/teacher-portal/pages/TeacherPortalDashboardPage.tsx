import { useNavigate } from "react-router-dom";
import { TEACHER_MODULE_ICONS } from "../teacher-portal-nav";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherTodayTimetableCard } from "../TeacherTodayTimetableCard";
import { useTeacherPortal } from "../teacher-portal-context";
import type { TeacherPortalModuleKey } from "../teacher-portal-types";
import { teacherHasCtpoRole, teacherIsStpoOnlyPortal } from "../teacher-section-scope-types";
import { TpCard, TpKpi, TpKpiGrid } from "../teacher-portal-ui";
import { HtpoDashboard } from "./HtpoDashboard";
import { TeacherDashboardHome } from "./TeacherDashboardHome";

const TILE_DESCRIPTIONS: Record<TeacherPortalModuleKey, string> = {
  dashboard: "Overview and assignments.",
  attendance: "Mark and review attendance.",
  timetable: "Teaching schedule.",
  results: "Result entry and review.",
  teams: "Section teams.",
  students: "Add students in your branch or section scope.",
  student_search: "Find and edit a student's full profile.",
  section_overview: "Section students grouped team-wise.",
  subjects: "Add and manage subjects.",
  syllabus: "Add and edit syllabus units/topics.",
  syllabus_progress: "Mark syllabus topics covered.",
  finance: "Fees where permitted.",
  announcements: "Scoped notices.",
  feedback: "Feedback forms in your scope.",
  applications: "Review student applications in your scope.",
  reports: "Exports and summaries."
};

export function TeacherPortalDashboardPage() {
  const { dashboard, refreshDashboard, menu, hasModule } = useTeacherPortal();
  const navigate = useNavigate();

  const hasHtpoRole = dashboard?.assignments.some((a) => a.role === "HTPO") ?? false;
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? menu?.roles ?? [];
  const isStpoOnlyPortal = teacherIsStpoOnlyPortal(roles);
  const hasCtpoRole = teacherHasCtpoRole(roles);
  const tiles = (menu?.modules ?? []).filter((item) => item.key !== "dashboard");

  if (hasHtpoRole && dashboard) {
    return (
      <RequireTeacherModule moduleKey="dashboard">
        <HtpoDashboard dashboard={dashboard} refreshDashboard={refreshDashboard} />
      </RequireTeacherModule>
    );
  }

  return (
    <RequireTeacherModule moduleKey="dashboard">
      <TpCard className="!border-0 !bg-transparent !p-0 !shadow-none">
        <h2 className="teacher-portal-topbar-title !text-2xl">
          {dashboard ? `Welcome, ${dashboard.teacher.fullName}` : "Teacher workspace"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--t3)" }}>
          {isStpoOnlyPortal
            ? "Your subject assignments, today’s classes, and syllabus progress."
            : "Modules are merged from your active STPO, CTPO, and HTPO assignments."}
        </p>
      </TpCard>

      <TpKpiGrid>
        <TpKpi label="Today classes" value={dashboard?.counts.todayClasses ?? 0} />
        {hasModule("teams") ? <TpKpi label="Teams" value={dashboard?.counts.teams ?? 0} /> : null}
        {hasModule("results") ? <TpKpi label="Result issues" value={dashboard?.counts.resultIssues ?? 0} /> : null}
        {hasModule("announcements") ? <TpKpi label="Unread notices" value={dashboard?.counts.announcements ?? 0} /> : null}
      </TpKpiGrid>

      {isStpoOnlyPortal && dashboard ? (
        <TeacherTodayTimetableCard slots={dashboard.todayTimetable} refreshDashboard={refreshDashboard} />
      ) : !hasCtpoRole && tiles.length ? (
        <TpCard>
          <h3 className="tp-card-title mb-3">Quick access</h3>
          <div className="teacher-portal-tile-grid">
            {tiles.map((tile) => {
              const Icon = TEACHER_MODULE_ICONS[tile.key];
              return (
                <button key={tile.key} type="button" className="teacher-portal-tile" onClick={() => navigate(tile.path)}>
                  <span className="teacher-portal-tile-icon" aria-hidden>
                    <Icon size={20} strokeWidth={2.1} />
                  </span>
                  <span className="teacher-portal-tile-label">{tile.label}</span>
                  <span className="teacher-portal-tile-desc">{TILE_DESCRIPTIONS[tile.key]}</span>
                </button>
              );
            })}
          </div>
        </TpCard>
      ) : null}

      <TeacherDashboardHome
        dashboard={dashboard}
        refreshDashboard={refreshDashboard}
        showTodayTimetable={!isStpoOnlyPortal}
        hideCtpoAssignmentCards={hasCtpoRole}
      />
    </RequireTeacherModule>
  );
}

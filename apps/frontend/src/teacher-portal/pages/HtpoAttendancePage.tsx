import { SafeActionButton } from "../../shared/SafeActionButton";
import { HtpoMarkAttendanceCard } from "../HtpoMarkAttendanceCard";
import { HtpoSupervisionSectionsCard } from "../HtpoSupervisionSectionsCard";
import { useTeacherSectionScope } from "../TeacherSectionScopeProvider";
import { TpCard, TpKpi, TpKpiGrid } from "../teacher-portal-ui";

export function HtpoAttendancePage({ refreshDashboard }: { refreshDashboard?: () => Promise<void> }) {
  const { setup, loading, loadError, refreshSetup } = useTeacherSectionScope();
  const overview = setup?.overview;

  if (loading) {
    return <p className="app-empty">Loading attendance…</p>;
  }

  if (loadError) {
    return (
      <TpCard>
        <h2 className="tp-card-title">Attendance could not load</h2>
        <p className="db-muted">{loadError}</p>
        <SafeActionButton className="db-wf-btn db-wf-btn--primary mt-3" run={refreshSetup}>
          Retry
        </SafeActionButton>
      </TpCard>
    );
  }

  if (!overview) {
    return (
      <TpCard>
        <h2 className="tp-card-title">Attendance overview could not load</h2>
        <p className="db-muted">
          Stop the backend terminal (Ctrl+C), run <code>npm run dev</code> again, then click Refresh.
        </p>
        <SafeActionButton
          className="db-wf-btn db-wf-btn--primary mt-3"
          run={async () => {
            await refreshSetup();
            if (refreshDashboard) await refreshDashboard();
          }}
        >
          Refresh
        </SafeActionButton>
      </TpCard>
    );
  }

  const sectionWord = overview.sectionCount === 1 ? "section" : "sections";

  return (
    <>
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
        <TpKpi label="Sections" value={overview.sectionCount} sub="Under your supervision" />
        <TpKpi
          label="Latest sessions"
          value={overview.supervisionSections.filter((row) => row.latestAttendance).length}
          sub="Sections with marked attendance"
        />
      </TpKpiGrid>

      <HtpoSupervisionSectionsCard sections={overview.supervisionSections} returnTo="/teacher/attendance" />
      <HtpoMarkAttendanceCard sections={overview.supervisionSections} />
    </>
  );
}

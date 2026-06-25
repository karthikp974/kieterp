import { TeacherAttendancePanel } from "../../attendance/AttendancePanels";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherSectionScopeProvider } from "../TeacherSectionScopeProvider";
import { useTeacherPortal } from "../teacher-portal-context";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { teacherUsesSupervisionAttendance } from "../teacher-section-scope-types";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { HtpoAttendancePage } from "./HtpoAttendancePage";

export function TeacherPortalAttendancePage() {
  const { dashboard, refreshDashboard } = useTeacherPortal();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];
  const useSupervisionUi = teacherUsesSupervisionAttendance(roles);

  return (
    <RequireTeacherModule moduleKey="attendance">
      {useSupervisionUi ? (
        <TeacherSectionScopeProvider setupPath="/api/portals/teacher/attendance/setup">
          <div className="teacher-portal-module-stack htpo-attendance-page-stack">
            <HtpoAttendancePage refreshDashboard={refreshDashboard} />
          </div>
        </TeacherSectionScopeProvider>
      ) : (
        <TeacherPortalModuleShell subtitle={TEACHER_MODULE_SUBTITLES.attendance}>
          <TeacherPortalPanelWrap>
            <TeacherAttendancePanel />
          </TeacherPortalPanelWrap>
        </TeacherPortalModuleShell>
      )}
    </RequireTeacherModule>
  );
}

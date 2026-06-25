import { ReportsDashboard } from "../../reports/ReportsDashboard";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

export function TeacherPortalReportsPage() {
  return (
    <RequireTeacherModule moduleKey="reports">
      <TeacherPortalModuleShell>
        <TeacherPortalPanelWrap>
          <ReportsDashboard mode="teacher" />
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

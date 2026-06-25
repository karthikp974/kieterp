import { TeacherApplicationsPanel } from "../../applications/ApplicationsPanels";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalApplicationsPage() {
  return (
    <RequireTeacherModule moduleKey="applications">
      <TeacherApplicationsPanel />
    </RequireTeacherModule>
  );
}

import { Navigate } from "react-router-dom";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { useTeacherPortal } from "../teacher-portal-context";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { teacherEligibleForSyllabus } from "../teacher-syllabus-types";
import { TeacherPortalModuleShell } from "../TeacherPortalModuleShell";
import { TeacherSubjectsPageContent } from "../TeacherSubjectsPageContent";

export function TeacherPortalSubjectsPage() {
  const { dashboard, defaultPath } = useTeacherPortal();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];

  if (dashboard && !teacherEligibleForSyllabus(roles)) {
    return <Navigate to={defaultPath} replace />;
  }

  return (
    <RequireTeacherModule moduleKey="subjects">
      <TeacherPortalModuleShell subtitle={TEACHER_MODULE_SUBTITLES.subjects}>
        <TeacherSubjectsPageContent />
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

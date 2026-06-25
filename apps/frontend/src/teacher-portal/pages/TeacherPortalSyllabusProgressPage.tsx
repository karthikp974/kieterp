import { Navigate } from "react-router-dom";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { useTeacherPortal } from "../teacher-portal-context";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { teacherEligibleForSyllabus } from "../teacher-syllabus-types";
import { TeacherPortalModuleShell } from "../TeacherPortalModuleShell";
import { TeacherSyllabusProgressContent } from "../TeacherSyllabusPageContent";

export function TeacherPortalSyllabusProgressPage() {
  const { dashboard, defaultPath } = useTeacherPortal();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];

  if (dashboard && !teacherEligibleForSyllabus(roles)) {
    return <Navigate to={defaultPath} replace />;
  }

  return (
    <RequireTeacherModule moduleKey="syllabus_progress">
      <TeacherPortalModuleShell subtitle={TEACHER_MODULE_SUBTITLES.syllabus_progress}>
        <TeacherSyllabusProgressContent />
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}

import { TeacherTimetablePanel } from "../../timetable/TimetablePanels";
import { HtpoAssignTeachersCard } from "../HtpoAssignTeachersCard";
import { HtpoSectionTimetableCard } from "../HtpoSectionTimetableCard";
import { HtpoYourTimetableCard } from "../HtpoYourTimetableCard";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherSectionScopeProvider } from "../TeacherSectionScopeProvider";
import { useTeacherPortal } from "../teacher-portal-context";
import { teacherHasHtpoRole, teacherUsesSupervisionTimetable } from "../teacher-section-scope-types";
import { TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

function SupervisionTimetableBody() {
  const { dashboard } = useTeacherPortal();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];
  const showAssignTeachers = teacherHasHtpoRole(roles);

  return (
    <>
      <HtpoSectionTimetableCard />
      {showAssignTeachers ? <HtpoAssignTeachersCard enabled /> : null}
    </>
  );
}

export function TeacherPortalTimetablePage() {
  const { dashboard } = useTeacherPortal();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];
  const useSupervisionUi = teacherUsesSupervisionTimetable(roles);

  return (
    <RequireTeacherModule moduleKey="timetable">
      <div className="teacher-portal-module-stack htpo-timetable-page-stack">
        {useSupervisionUi ? (
          <TeacherSectionScopeProvider setupPath="/api/portals/teacher/timetable/setup">
            <SupervisionTimetableBody />
          </TeacherSectionScopeProvider>
        ) : (
          <TeacherPortalPanelWrap>
            <TeacherTimetablePanel />
          </TeacherPortalPanelWrap>
        )}
        <HtpoYourTimetableCard />
      </div>
    </RequireTeacherModule>
  );
}

import { Outlet } from "react-router-dom";
import { StudentPortalProvider } from "../students/student-portal-context";
import { RequireTeacherModule } from "./RequireTeacherModule";

export function TeacherStudentsLayout() {
  return (
    <StudentPortalProvider variant="teacher">
      <RequireTeacherModule moduleKey="students">
        <Outlet />
      </RequireTeacherModule>
    </StudentPortalProvider>
  );
}

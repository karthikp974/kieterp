import { Outlet } from "react-router-dom";
import { FeedbackPortalProvider } from "../feedback/feedback-portal-context";
import { RequireTeacherModule } from "./RequireTeacherModule";
import { TeacherEngageScopeProvider } from "./TeacherEngageScopeProvider";

/** Full admin feedback workflow without an extra portal hero header. */
export function TeacherFeedbackLayout() {
  return (
    <RequireTeacherModule moduleKey="feedback">
      <TeacherEngageScopeProvider>
        <FeedbackPortalProvider basePath="/teacher/feedback" variant="teacher">
          <Outlet />
        </FeedbackPortalProvider>
      </TeacherEngageScopeProvider>
    </RequireTeacherModule>
  );
}

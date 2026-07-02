import { Navigate, Route, Routes } from "react-router-dom";
import * as Pages from "./app-lazy-pages";
import { ActivityTracker } from "./auth/use-activity-tracker";
import { LoginPage } from "./auth/LoginPage";
import { OwnerRoute } from "./auth/OwnerRoute";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/auth-context";
import { getDefaultPortal } from "./auth/portal-redirect";
import { SpectatorDashboardPage } from "./spectator/SpectatorDashboardPage";
import { ErpLoader } from "./shared/ErpLoader";
import { LazyRouteBoundary } from "./shared/LazyRouteBoundary";
import { Shell } from "./shared/Shell";
import { useChunkLoadRecovery } from "./shared/useChunkLoadRecovery";

export function App() {
  const { user, isLoading } = useAuth();
  useChunkLoadRecovery();

  return (
    <>
      {user ? <ActivityTracker /> : null}
      <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<OwnerRoute />}>
        <Route path="ops" element={<SpectatorDashboardPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedTypes={["ADMIN"]} />}>
        <Route element={<LazyRouteBoundary />}>
          <Route path="department-branch" element={<Pages.DepartmentBranchHomePage />} />
          <Route path="department-branch/add-department" element={<Pages.AddDepartmentPage />} />
          <Route path="department-branch/add-branch" element={<Pages.AddBranchPage />} />
          <Route path="department-branch/modify-department" element={<Pages.ModifyDepartmentPage />} />
          <Route path="department-branch/modify-branch" element={<Pages.ModifyBranchPage />} />
          <Route path="department-branch/delete-department" element={<Pages.DeleteDepartmentPage />} />
          <Route path="department-branch/delete-branch" element={<Pages.DeleteBranchPage />} />
          <Route path="department-branch/existing-records" element={<Pages.DepartmentBranchExistingRecordsPage />} />
          <Route path="department-branch/history" element={<Pages.ModuleHistoryPage title="Department & Branch" entities={["Program", "Branch"]} />} />
          <Route path="classes-sections" element={<Pages.ClassesSectionsHomePage />} />
          <Route path="classes-sections/add-class" element={<Pages.AddClassPage />} />
          <Route path="classes-sections/add-section" element={<Pages.AddSectionPage />} />
          <Route path="classes-sections/modify-class" element={<Pages.ModifyClassPage />} />
          <Route path="classes-sections/modify-section" element={<Pages.ModifySectionPage />} />
          <Route path="classes-sections/delete-class" element={<Pages.DeleteClassPage />} />
          <Route path="classes-sections/delete-section" element={<Pages.DeleteSectionPage />} />
          <Route path="classes-sections/existing-records" element={<Pages.ClassesSectionsExistingRecordsPage />} />
          <Route path="classes-sections/history" element={<Pages.ModuleHistoryPage title="Classes & Sections" entities={["AcademicClass", "Section"]} />} />
          <Route path="batches" element={<Pages.BatchesHomePage />} />
          <Route path="batches/add-batch" element={<Pages.AddBatchWorkflowPage />} />
          <Route path="batches/modify-batch" element={<Pages.ModifyBatchPage />} />
          <Route path="batches/delete-batch" element={<Pages.DeleteBatchPage />} />
          <Route path="batches/existing-records" element={<Pages.BatchesExistingRecordsPage />} />
          <Route path="batches/history" element={<Pages.ModuleHistoryPage title="Batches" entities={["Batch"]} />} />
          <Route path="subjects" element={<Pages.SubjectsHomePage />} />
          <Route path="subjects/add-subject" element={<Pages.AddSubjectPage />} />
          <Route path="subjects/modify-subject" element={<Pages.ModifySubjectPage />} />
          <Route path="subjects/delete-subject" element={<Pages.DeleteSubjectPage />} />
          <Route path="subjects/existing-records" element={<Pages.SubjectsExistingRecordsPage />} />
          <Route path="subjects/history" element={<Pages.ModuleHistoryPage title="Subjects" entities={["Subject"]} />} />
          <Route path="syllabus" element={<Pages.SyllabusHomePage />} />
          <Route path="syllabus/add-syllabus" element={<Pages.AddSyllabusPage />} />
          <Route path="syllabus/modify-syllabus" element={<Pages.ModifySyllabusPage />} />
          <Route path="syllabus/delete-syllabus" element={<Pages.DeleteSyllabusPage />} />
          <Route path="syllabus/existing-records" element={<Pages.SyllabusExistingRecordsPage />} />
          <Route path="syllabus/history" element={<Pages.ModuleHistoryPage title="Syllabus" entities={["Syllabus"]} />} />
          <Route path="teachers" element={<Pages.TeachersHomePage />} />
          <Route path="teachers/add-teacher" element={<Pages.AddTeacherPage />} />
          <Route path="teachers/modify-teacher" element={<Pages.ModifyTeacherPage />} />
          <Route path="teachers/delete-teacher" element={<Pages.DeleteTeacherPage />} />
          <Route path="teachers/existing-records" element={<Pages.TeachersExistingRecordsPage />} />
          <Route path="teachers/history" element={<Pages.ModuleHistoryPage title="Teachers" entities={["TeacherProfile"]} />} />
          <Route path="students" element={<Pages.StudentsHomePage />} />
          <Route path="students/add-student" element={<Pages.AddStudentPage />} />
          <Route path="students/modify-student" element={<Pages.ModifyStudentPage />} />
          <Route path="students/delete-student" element={<Pages.DeleteStudentPage />} />
          <Route path="students/existing-records" element={<Pages.StudentsExistingRecordsPage />} />
          <Route path="students/history" element={<Pages.ModuleHistoryPage title="Students" entities={["StudentProfile"]} />} />
          <Route path="promotion" element={<Pages.PromotionHomePage />} />
          <Route path="promotion/promote-students" element={<Pages.PromotionRunPage />} />
          <Route path="promotion/history" element={<Pages.ModuleHistoryPage title="Promotion" entities={["StudentPromotionHistory"]} />} />
          <Route path="fee-structure" element={<Pages.FeeStructureHomePage />} />
          <Route path="fee-structure/assign-fee" element={<Pages.FeeStructureAssignPage />} />
          <Route path="fee-structure/history" element={<Pages.ModuleHistoryPage title="Fee Structure" entities={["FeeStructure"]} />} />
          <Route path="payments/register" element={<Pages.PaymentsRegisterPage />} />
          <Route path="payments/history" element={<Pages.PaymentsHistoryPage />} />
          <Route path="payments" element={<Pages.PaymentsHubPage />} />
          <Route path="announcements" element={<Pages.AnnouncementsHubPage />} />
          <Route path="announcements/create" element={<Pages.AnnouncementCreatePage />} />
          <Route path="announcements/history" element={<Pages.AnnouncementHistoryPage />} />
          <Route path="feedback" element={<Pages.FeedbackHubPage />} />
          <Route path="feedback/create-feedback-form" element={<Pages.FeedbackCreateFormPage />} />
          <Route path="feedback/modify-feedback-form" element={<Pages.FeedbackModifyFormPage />} />
          <Route path="feedback/modify-feedback-form/:formId" element={<Pages.FeedbackModifyFormPage />} />
          <Route path="feedback/delete-feedback-form" element={<Pages.FeedbackDeleteFormPage />} />
          <Route path="feedback/active-forms" element={<Pages.FeedbackActiveFormsPage />} />
          <Route path="feedback/archived-feedbacks" element={<Pages.FeedbackArchivedPage />} />
          <Route path="feedback/feedback-reports" element={<Pages.FeedbackReportsHubPage />} />
          <Route path="feedback/feedback-reports/:formId" element={<Pages.FeedbackReportDetailPage />} />
          <Route path="feedback/feedback-reports/:formId/questions/:questionId/paragraphs" element={<Pages.FeedbackParagraphAnswersPage />} />
          <Route path="reports" element={<Pages.ReportsHomePage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute allowedTypes={["ADMIN", "TEACHER"]} />}>
        <Route element={<LazyRouteBoundary />}>
          <Route path="teacher" element={<Pages.TeacherPortalShell />}>
            <Route index element={<Pages.TeacherPortalDashboardPage />} />
            <Route path="sections/:sectionId/students/:studentProfileId" element={<Pages.HtpoStudentAttendanceDetailPage />} />
            <Route path="sections/:sectionId" element={<Pages.HtpoSectionDetailPage />} />
            <Route path="attendance/mark/:sectionId" element={<Pages.HtpoMarkAttendancePage />} />
            <Route path="attendance" element={<Pages.TeacherPortalAttendancePage />} />
            <Route path="timetable" element={<Pages.TeacherPortalTimetablePage />} />
            <Route path="timetable/edit" element={<Pages.TeacherPortalEditTimetablePage />} />
            <Route path="timetable/assign-teacher" element={<Pages.TeacherPortalAssignTeacherPage />} />
            <Route path="results" element={<Pages.TeacherPortalResultsPage />} />
            <Route path="results/upload" element={<Pages.TeacherPortalResultsUploadPage />} />
            <Route path="results/import/:jobId" element={<Pages.TeacherPortalResultsImportReportPage />} />
            <Route path="results/add" element={<Pages.TeacherPortalResultsAddPage />} />
            <Route path="results/students/:studentProfileId" element={<Pages.TeacherPortalResultsStudentPage />} />
            <Route path="teams" element={<Pages.TeacherPortalTeamsPage />} />
            <Route path="teams/create" element={<Pages.TeacherPortalTeamsCreatePage />} />
            <Route path="students" element={<Pages.TeacherStudentsLayout />}>
              <Route index element={<Pages.StudentsHomePage />} />
              <Route path="add-student" element={<Pages.AddStudentPage />} />
              <Route path="modify-student" element={<Pages.ModifyStudentPage />} />
              <Route path="history" element={<Pages.ModuleHistoryPage title="Add Student" entities={["StudentProfile"]} />} />
            </Route>
            <Route path="student-search" element={<Pages.TeacherPortalSearchStudentPage />} />
            <Route path="student-search/:studentProfileId" element={<Pages.TeacherPortalStudentDetailPage />} />
            <Route path="section-overview" element={<Pages.TeacherPortalSectionOverviewPage />} />
            <Route path="teams/:teamId/edit" element={<Pages.TeacherPortalTeamsEditPage />} />
            <Route path="subjects" element={<Pages.TeacherPortalSubjectsPage />} />
            <Route path="syllabus" element={<Pages.TeacherPortalSyllabusPage />} />
            <Route path="syllabus/manage" element={<Pages.TeacherPortalSyllabusManagePage />} />
            <Route path="syllabus/progress" element={<Pages.TeacherPortalSyllabusProgressPage />} />
            <Route path="announcements" element={<Pages.TeacherAnnouncementsLayout />}>
              <Route index element={<Pages.AnnouncementsHubPage />} />
              <Route path="create" element={<Pages.AnnouncementCreatePage />} />
              <Route path="history" element={<Pages.AnnouncementHistoryPage />} />
            </Route>
            <Route path="feedback" element={<Pages.TeacherFeedbackLayout />}>
              <Route index element={<Pages.FeedbackHubPage />} />
              <Route path="create-feedback-form" element={<Pages.FeedbackCreateFormPage />} />
              <Route path="modify-feedback-form" element={<Pages.FeedbackModifyFormPage />} />
              <Route path="modify-feedback-form/:formId" element={<Pages.FeedbackModifyFormPage />} />
              <Route path="delete-feedback-form" element={<Pages.FeedbackDeleteFormPage />} />
              <Route path="active-forms" element={<Pages.FeedbackActiveFormsPage />} />
              <Route path="archived-feedbacks" element={<Pages.FeedbackArchivedPage />} />
              <Route path="feedback-reports" element={<Pages.FeedbackReportsHubPage />} />
              <Route path="feedback-reports/:formId" element={<Pages.FeedbackReportDetailPage />} />
              <Route path="feedback-reports/:formId/questions/:questionId/paragraphs" element={<Pages.FeedbackParagraphAnswersPage />} />
            </Route>
            <Route path="applications" element={<Pages.TeacherPortalApplicationsPage />} />
            <Route path="finance" element={<Pages.TeacherPortalFinancePage />} />
            <Route path="finance/recent-payments" element={<Pages.TeacherPortalFinanceRecentPaymentsPage />} />
            <Route path="finance/pending" element={<Pages.TeacherPortalFinancePendingPage />} />
            <Route path="reports" element={<Pages.TeacherPortalReportsPage />} />
            <Route path="notifications" element={<Pages.TeacherPortalNotificationsPage />} />
          </Route>
        </Route>
      </Route>
      <Route element={<ProtectedRoute allowedTypes={["ADMIN", "STUDENT"]} />}>
        <Route element={<LazyRouteBoundary />}>
          <Route path="student" element={<Pages.StudentPortalShell />}>
            <Route index element={<Pages.StudentPortalDashboardPage />} />
            <Route path="academics/timetable" element={<Pages.StudentPortalTimetablePage />} />
            <Route path="academics/attendance" element={<Pages.StudentPortalAttendancePage />} />
            <Route path="academics/marks" element={<Pages.StudentPortalMarksPage />} />
            <Route path="academics/subjects" element={<Pages.StudentPortalSubjectsPage />} />
            <Route path="fees/status" element={<Pages.StudentPortalFeeStatusPage />} />
            <Route path="fees/receipts" element={<Pages.StudentPortalReceiptsPage />} />
            <Route path="engage/announcements" element={<Pages.StudentPortalAnnouncementsPage />} />
            <Route path="engage/applications" element={<Pages.StudentApplicationsPage />} />
            <Route path="engage/profile" element={<Pages.StudentPortalProfilePage />} />
            <Route path="notifications" element={<Pages.StudentPortalNotificationsPage />} />
            <Route path="feedback" element={<Pages.StudentFeedbackListPage />} />
            <Route path="feedback/:formId" element={<Pages.StudentFeedbackFillPage />} />
          </Route>
        </Route>
      </Route>
      <Route element={isLoading ? <ErpLoader fullScreen /> : <Shell />}>
        <Route index element={<Navigate to={user ? getDefaultPortal(user.type, user.username) : "/login"} replace />} />
        <Route element={<ProtectedRoute allowedTypes={["ADMIN"]} />}>
          <Route element={<LazyRouteBoundary />}>
            <Route path="admin" element={<Pages.AdminDashboardPage />} />
            <Route path="admin/fees/collected" element={<Pages.AdminFeeCollectionPage />} />
            <Route path="admin/fees/collected/:date" element={<Pages.AdminFeeCollectionDayPage />} />
            <Route path="admin/modules" element={<Pages.AdminPortal />} />
            <Route path="database" element={<Pages.DatabasePortal />} />
          </Route>
        </Route>
      </Route>
    </Routes>
    </>
  );
}

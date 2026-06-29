import { lazy } from "react";

/** Route-level lazy imports keep the main bundle small (Vite code-splitting). */
export const DepartmentBranchHomePage = lazy(() =>
  import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.DepartmentBranchHomePage }))
);
export const AddDepartmentPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.AddDepartmentPage })));
export const AddBranchPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.AddBranchPage })));
export const ModifyDepartmentPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.ModifyDepartmentPage })));
export const ModifyBranchPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.ModifyBranchPage })));
export const DeleteDepartmentPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.DeleteDepartmentPage })));
export const DeleteBranchPage = lazy(() => import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.DeleteBranchPage })));
export const DepartmentBranchExistingRecordsPage = lazy(() =>
  import("./department-branch/DepartmentBranchPages").then((m) => ({ default: m.DepartmentBranchExistingRecordsPage }))
);

export const ClassesSectionsHomePage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.ClassesSectionsHomePage })));
export const AddClassPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.AddClassPage })));
export const AddSectionPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.AddSectionPage })));
export const ModifyClassPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.ModifyClassPage })));
export const ModifySectionPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.ModifySectionPage })));
export const DeleteClassPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.DeleteClassPage })));
export const DeleteSectionPage = lazy(() => import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.DeleteSectionPage })));
export const ClassesSectionsExistingRecordsPage = lazy(() =>
  import("./classes-sections/ClassesSectionsPages").then((m) => ({ default: m.ClassesSectionsExistingRecordsPage }))
);

export const BatchesHomePage = lazy(() => import("./batches/BatchPages").then((m) => ({ default: m.BatchesHomePage })));
export const AddBatchWorkflowPage = lazy(() => import("./batches/BatchPages").then((m) => ({ default: m.AddBatchPage })));
export const ModifyBatchPage = lazy(() => import("./batches/BatchPages").then((m) => ({ default: m.ModifyBatchPage })));
export const DeleteBatchPage = lazy(() => import("./batches/BatchPages").then((m) => ({ default: m.DeleteBatchPage })));
export const BatchesExistingRecordsPage = lazy(() => import("./batches/BatchPages").then((m) => ({ default: m.BatchesExistingRecordsPage })));

export const SubjectsHomePage = lazy(() => import("./subjects/SubjectPages").then((m) => ({ default: m.SubjectsHomePage })));
export const AddSubjectPage = lazy(() => import("./subjects/SubjectPages").then((m) => ({ default: m.AddSubjectPage })));
export const ModifySubjectPage = lazy(() => import("./subjects/SubjectPages").then((m) => ({ default: m.ModifySubjectPage })));
export const DeleteSubjectPage = lazy(() => import("./subjects/SubjectPages").then((m) => ({ default: m.DeleteSubjectPage })));
export const SubjectsExistingRecordsPage = lazy(() => import("./subjects/SubjectPages").then((m) => ({ default: m.SubjectsExistingRecordsPage })));

export const SyllabusHomePage = lazy(() => import("./syllabus/SyllabusPages").then((m) => ({ default: m.SyllabusHomePage })));
export const AddSyllabusPage = lazy(() => import("./syllabus/SyllabusPages").then((m) => ({ default: m.AddSyllabusPage })));
export const ModifySyllabusPage = lazy(() => import("./syllabus/SyllabusPages").then((m) => ({ default: m.ModifySyllabusPage })));
export const DeleteSyllabusPage = lazy(() => import("./syllabus/SyllabusPages").then((m) => ({ default: m.DeleteSyllabusPage })));
export const SyllabusExistingRecordsPage = lazy(() => import("./syllabus/SyllabusPages").then((m) => ({ default: m.SyllabusExistingRecordsPage })));

export const TeachersHomePage = lazy(() => import("./teachers/TeacherPages").then((m) => ({ default: m.TeachersHomePage })));
export const AddTeacherPage = lazy(() => import("./teachers/TeacherPages").then((m) => ({ default: m.AddTeacherPage })));
export const ModifyTeacherPage = lazy(() => import("./teachers/TeacherPages").then((m) => ({ default: m.ModifyTeacherPage })));
export const DeleteTeacherPage = lazy(() => import("./teachers/TeacherPages").then((m) => ({ default: m.DeleteTeacherPage })));
export const TeachersExistingRecordsPage = lazy(() => import("./teachers/TeacherPages").then((m) => ({ default: m.TeachersExistingRecordsPage })));

export const StudentsHomePage = lazy(() => import("./students/StudentPages").then((m) => ({ default: m.StudentsHomePage })));
export const AddStudentPage = lazy(() => import("./students/StudentPages").then((m) => ({ default: m.AddStudentPage })));
export const ModifyStudentPage = lazy(() => import("./students/StudentPages").then((m) => ({ default: m.ModifyStudentPage })));
export const DeleteStudentPage = lazy(() => import("./students/StudentPages").then((m) => ({ default: m.DeleteStudentPage })));
export const StudentsExistingRecordsPage = lazy(() => import("./students/StudentPages").then((m) => ({ default: m.StudentsExistingRecordsPage })));

export const PromotionHomePage = lazy(() => import("./promotions/PromotionPages").then((m) => ({ default: m.PromotionHomePage })));
export const PromotionRunPage = lazy(() => import("./promotions/PromotionPages").then((m) => ({ default: m.PromotionRunPage })));
export const FeeStructureHomePage = lazy(() => import("./finance/FeeStructurePages").then((m) => ({ default: m.FeeStructureHomePage })));
export const FeeStructureAssignPage = lazy(() => import("./finance/FeeStructurePages").then((m) => ({ default: m.FeeStructureAssignPage })));
export const PaymentsHubPage = lazy(() => import("./finance/PaymentsPages").then((m) => ({ default: m.PaymentsHubPage })));
export const PaymentsRegisterPage = lazy(() => import("./finance/PaymentsPages").then((m) => ({ default: m.PaymentsRegisterPage })));
export const PaymentsHistoryPage = lazy(() => import("./finance/PaymentsPages").then((m) => ({ default: m.PaymentsHistoryPage })));

export const ModuleHistoryPage = lazy(() => import("./shared/ModuleHistoryPage").then((m) => ({ default: m.ModuleHistoryPage })));

export const AnnouncementsHubPage = lazy(() => import("./announcements/AnnouncementPages").then((m) => ({ default: m.AnnouncementsHubPage })));
export const AnnouncementCreatePage = lazy(() => import("./announcements/AnnouncementPages").then((m) => ({ default: m.AnnouncementCreatePage })));
export const AnnouncementHistoryPage = lazy(() => import("./announcements/AnnouncementPages").then((m) => ({ default: m.AnnouncementHistoryPage })));

export const ReportsHomePage = lazy(() => import("./reports/ReportsPanels").then((m) => ({ default: m.ReportsHomePage })));
export const FeedbackHubPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackHubPage })));
export const FeedbackCreateFormPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackCreateFormPage })));
export const FeedbackModifyFormPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackModifyFormPage })));
export const FeedbackDeleteFormPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackDeleteFormPage })));
export const FeedbackActiveFormsPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackActiveFormsPage })));
export const FeedbackArchivedPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackArchivedPage })));
export const FeedbackReportsHubPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackReportsHubPage })));
export const FeedbackReportDetailPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackReportDetailPage })));
export const FeedbackParagraphAnswersPage = lazy(() => import("./feedback/FeedbackPages").then((m) => ({ default: m.FeedbackParagraphAnswersPage })));
export const StudentFeedbackListPage = lazy(() =>
  import("./student-portal/StudentPortalFeedbackPage").then((m) => ({ default: m.StudentPortalFeedbackPage }))
);
export const StudentFeedbackFillPage = lazy(() =>
  import("./student-portal/StudentPortalFeedbackFillPage").then((m) => ({ default: m.StudentPortalFeedbackFillPage }))
);

export const AdminDashboardPage = lazy(() => import("./portals/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
export const AdminFeeCollectionPage = lazy(() => import("./portals/AdminFeeCollectionPage").then((m) => ({ default: m.AdminFeeCollectionPage })));
export const AdminFeeCollectionDayPage = lazy(() => import("./portals/AdminFeeCollectionDayPage").then((m) => ({ default: m.AdminFeeCollectionDayPage })));
export const AdminPortal = lazy(() => import("./portals/AdminPortal").then((m) => ({ default: m.AdminPortal })));
export const DatabasePortal = lazy(() => import("./portals/DatabasePortal").then((m) => ({ default: m.DatabasePortal })));
export const TeacherPortalShell = lazy(() => import("./teacher-portal/TeacherPortalShell").then((m) => ({ default: m.TeacherPortalShell })));
export const TeacherPortalDashboardPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalDashboardPage").then((m) => ({ default: m.TeacherPortalDashboardPage }))
);
export const HtpoSectionDetailPage = lazy(() =>
  import("./teacher-portal/pages/HtpoSectionDetailPage").then((m) => ({ default: m.HtpoSectionDetailPage }))
);
export const HtpoStudentAttendanceDetailPage = lazy(() =>
  import("./teacher-portal/pages/HtpoStudentAttendanceDetailPage").then((m) => ({
    default: m.HtpoStudentAttendanceDetailPage
  }))
);
export const TeacherPortalAttendancePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalAttendancePage").then((m) => ({ default: m.TeacherPortalAttendancePage }))
);
export const HtpoMarkAttendancePage = lazy(() =>
  import("./teacher-portal/pages/HtpoMarkAttendancePage").then((m) => ({ default: m.HtpoMarkAttendancePage }))
);
export const TeacherPortalTimetablePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalTimetablePage").then((m) => ({ default: m.TeacherPortalTimetablePage }))
);
export const TeacherPortalEditTimetablePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalEditTimetablePage").then((m) => ({ default: m.TeacherPortalEditTimetablePage }))
);
export const TeacherPortalAssignTeacherPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalAssignTeacherPage").then((m) => ({ default: m.TeacherPortalAssignTeacherPage }))
);
export const TeacherPortalResultsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalResultsPage").then((m) => ({ default: m.TeacherPortalResultsPage }))
);
export const TeacherPortalResultsUploadPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalResultsUploadPage").then((m) => ({ default: m.TeacherPortalResultsUploadPage }))
);
export const TeacherPortalResultsImportReportPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalResultsImportReportPage").then((m) => ({
    default: m.TeacherPortalResultsImportReportPage
  }))
);
export const TeacherPortalResultsAddPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalResultsAddPage").then((m) => ({ default: m.TeacherPortalResultsAddPage }))
);
export const TeacherPortalResultsStudentPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalResultsStudentPage").then((m) => ({ default: m.TeacherPortalResultsStudentPage }))
);
export const TeacherPortalTeamsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalTeamsPage").then((m) => ({ default: m.TeacherPortalTeamsPage }))
);
export const TeacherPortalSearchStudentPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSearchStudentPage").then((m) => ({ default: m.TeacherPortalSearchStudentPage }))
);
export const TeacherPortalSectionOverviewPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSectionOverviewPage").then((m) => ({ default: m.TeacherPortalSectionOverviewPage }))
);
export const TeacherPortalStudentDetailPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalStudentDetailPage").then((m) => ({ default: m.TeacherPortalStudentDetailPage }))
);
export const TeacherStudentsLayout = lazy(() =>
  import("./teacher-portal/TeacherStudentsLayout").then((m) => ({ default: m.TeacherStudentsLayout }))
);
export const TeacherPortalTeamsCreatePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalTeamsCreatePage").then((m) => ({ default: m.TeacherPortalTeamsCreatePage }))
);
export const TeacherPortalTeamsEditPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalTeamsEditPage").then((m) => ({ default: m.TeacherPortalTeamsEditPage }))
);
export const TeacherPortalSyllabusPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSyllabusPage").then((m) => ({ default: m.TeacherPortalSyllabusPage }))
);
export const TeacherPortalSyllabusManagePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSyllabusManagePage").then((m) => ({
    default: m.TeacherPortalSyllabusManagePage
  }))
);
export const TeacherPortalSubjectsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSubjectsPage").then((m) => ({ default: m.TeacherPortalSubjectsPage }))
);
export const TeacherPortalSyllabusProgressPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalSyllabusProgressPage").then((m) => ({ default: m.TeacherPortalSyllabusProgressPage }))
);
export const TeacherAnnouncementsLayout = lazy(() =>
  import("./teacher-portal/TeacherAnnouncementsLayout").then((m) => ({ default: m.TeacherAnnouncementsLayout }))
);
export const TeacherFeedbackLayout = lazy(() =>
  import("./teacher-portal/TeacherFeedbackLayout").then((m) => ({ default: m.TeacherFeedbackLayout }))
);
export const TeacherPortalFinancePage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalFinancePage").then((m) => ({ default: m.TeacherPortalFinancePage }))
);
export const TeacherPortalFinanceRecentPaymentsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalFinanceRecentPaymentsPage").then((m) => ({
    default: m.TeacherPortalFinanceRecentPaymentsPage
  }))
);
export const TeacherPortalFinancePendingPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalFinancePendingPage").then((m) => ({ default: m.TeacherPortalFinancePendingPage }))
);
export const TeacherPortalReportsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalReportsPage").then((m) => ({ default: m.TeacherPortalReportsPage }))
);
export const StudentPortalShell = lazy(() => import("./student-portal/StudentPortalShell").then((m) => ({ default: m.StudentPortalShell })));
export const StudentPortalDashboardPage = lazy(() =>
  import("./student-portal/StudentPortalDashboardPage").then((m) => ({ default: m.StudentPortalDashboardPage }))
);
export const StudentPortalAttendancePage = lazy(() =>
  import("./student-portal/StudentPortalAttendancePage").then((m) => ({ default: m.StudentPortalAttendancePage }))
);
export const StudentPortalTimetablePage = lazy(() =>
  import("./student-portal/StudentPortalTimetablePage").then((m) => ({ default: m.StudentPortalTimetablePage }))
);
export const StudentPortalMarksPage = lazy(() =>
  import("./student-portal/StudentPortalMarksPage").then((m) => ({ default: m.StudentPortalMarksPage }))
);
export const StudentPortalSubjectsPage = lazy(() =>
  import("./student-portal/StudentPortalSubjectsPage").then((m) => ({ default: m.StudentPortalSubjectsPage }))
);
export const StudentPortalFeeStatusPage = lazy(() =>
  import("./student-portal/StudentPortalFeeStatusPage").then((m) => ({ default: m.StudentPortalFeeStatusPage }))
);
export const StudentPortalReceiptsPage = lazy(() =>
  import("./student-portal/StudentPortalReceiptsPage").then((m) => ({ default: m.StudentPortalReceiptsPage }))
);
export const StudentPortalAnnouncementsPage = lazy(() =>
  import("./student-portal/StudentPortalAnnouncementsPage").then((m) => ({ default: m.StudentPortalAnnouncementsPage }))
);
export const StudentPortalNotificationsPage = lazy(() =>
  import("./student-portal/StudentPortalNotificationsPage").then((m) => ({ default: m.StudentPortalNotificationsPage }))
);
export const StudentPortalProfilePage = lazy(() =>
  import("./student-portal/StudentPortalProfilePage").then((m) => ({ default: m.StudentPortalProfilePage }))
);
export const TeacherPortalApplicationsPage = lazy(() =>
  import("./teacher-portal/pages/TeacherPortalApplicationsPage").then((m) => ({ default: m.TeacherPortalApplicationsPage }))
);
export const TeacherPortalNotificationsPage = lazy(() =>
  import("./teacher-portal/TeacherPortalNotificationsPage").then((m) => ({ default: m.TeacherPortalNotificationsPage }))
);
export const StudentApplicationsPage = lazy(() =>
  import("./student-portal/StudentPortalApplicationsPage").then((m) => ({ default: m.StudentPortalApplicationsPage }))
);

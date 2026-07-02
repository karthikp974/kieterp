import { Module } from "@nestjs/common";
import { AnnouncementsModule } from "../announcements/announcements.module";
import { FeedbackModule } from "../feedback/feedback.module";
import { TimetableModule } from "../timetable/timetable.module";
import { AdminPortalDashboardService } from "./admin-portal-dashboard.service";
import { PortalsController } from "./portals.controller";
import { StudentPortalAttendanceService } from "./student-portal-attendance.service";
import { StudentPortalDashboardService } from "./student-portal-dashboard.service";
import { StudentPortalAnnouncementsService } from "./student-portal-announcements.service";
import { StudentPortalNotificationsService } from "./student-portal-notifications.service";
import { StudentPortalMarksService } from "./student-portal-marks.service";
import { StudentPortalFeesService } from "./student-portal-fees.service";
import { StudentPortalFeedbackService } from "./student-portal-feedback.service";
import { StudentPortalProfileService } from "./student-portal-profile.service";
import { StudentPortalReceiptsService } from "./student-portal-receipts.service";
import { StudentPortalSubjectsService } from "./student-portal-subjects.service";
import { StudentPortalSyllabusService } from "./student-portal-syllabus.service";
import { StudentPortalTimetableService } from "./student-portal-timetable.service";
import { SyllabusUnitResourcesService } from "./syllabus-unit-resources.service";
import { TeacherPortalNotificationsService } from "./teacher-portal-notifications.service";
import { TeacherPortalDashboardService } from "./teacher-portal-dashboard.service";
import { TeacherPortalHtpoAttendanceService } from "./teacher-portal-htpo-attendance.service";
import { TeacherPortalMenuService } from "./teacher-portal-menu.service";
import { QueuesModule } from "../queues/queues.module";
import { ResultsModule } from "../results/results.module";
import { ReportsModule } from "../reports/reports.module";
import { StudentsModule } from "../students/students.module";
import { TeacherPortalStudentsService } from "./teacher-portal-students.service";
import { TeacherPortalStudentSearchService } from "./teacher-portal-student-search.service";
import { TeacherPortalSectionOverviewService } from "./teacher-portal-section-overview.service";
import { TeacherPortalResultsService } from "./teacher-portal-results.service";
import { TeacherPortalTeamsService } from "./teacher-portal-teams.service";
import { TeacherPortalFinanceService } from "./teacher-portal-finance.service";
import { TeacherPortalEngageService } from "./teacher-portal-engage.service";
import { TeacherPortalSyllabusService } from "./teacher-portal-syllabus.service";
import { TeacherPortalSubjectsService } from "./teacher-portal-subjects.service";
import { TeacherPortalTimetableService } from "./teacher-portal-timetable.service";

@Module({
  imports: [AnnouncementsModule, FeedbackModule, TimetableModule, QueuesModule, ResultsModule, ReportsModule, StudentsModule],
  controllers: [PortalsController],
  providers: [
    StudentPortalAnnouncementsService,
    StudentPortalNotificationsService,
    StudentPortalDashboardService,
    StudentPortalAttendanceService,
    StudentPortalTimetableService,
    StudentPortalMarksService,
    StudentPortalSyllabusService,
    StudentPortalSubjectsService,
    StudentPortalFeesService,
    StudentPortalReceiptsService,
    StudentPortalFeedbackService,
    StudentPortalProfileService,
    SyllabusUnitResourcesService,
    TeacherPortalMenuService,
    TeacherPortalSyllabusService,
    TeacherPortalSubjectsService,
    TeacherPortalNotificationsService,
    TeacherPortalDashboardService,
    TeacherPortalHtpoAttendanceService,
    TeacherPortalTimetableService,
    TeacherPortalStudentsService,
    TeacherPortalStudentSearchService,
    TeacherPortalSectionOverviewService,
    TeacherPortalResultsService,
    TeacherPortalTeamsService,
    TeacherPortalFinanceService,
    TeacherPortalEngageService,
    AdminPortalDashboardService
  ]
})
export class PortalsModule {}

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { formatIstDate, istDayOfWeek } from "../common/ist-time.util";
import { memoryStorage } from "multer";
import { Request, Response } from "express";
import { StudentAttendanceExportQueryDto, StudentAttendancePageQueryDto } from "./student-attendance-portal.dto";
import { StudentAttendanceHistoryQueryDto } from "./student-dashboard.dto";
import { StudentMarksPdfQueryDto } from "./student-marks-portal.dto";
import { StudentTimetableQueryDto } from "./student-timetable-portal.dto";
import { StudentPortalAttendanceService } from "./student-portal-attendance.service";
import { StudentPortalDashboardService } from "./student-portal-dashboard.service";
import { StudentPortalMarksService } from "./student-portal-marks.service";
import { StudentFeePaymentInitiateDto } from "./student-fees-portal.dto";
import { StudentPortalFeesService } from "./student-portal-fees.service";
import { StudentPortalReceiptsService } from "./student-portal-receipts.service";
import { StudentPortalSubjectsService } from "./student-portal-subjects.service";
import { StudentSubjectsQueryDto } from "./student-subjects-portal.dto";
import { StudentPortalTimetableService } from "./student-portal-timetable.service";
import { SyllabusUnitResourcesService } from "./syllabus-unit-resources.service";
import { CreateSyllabusUnitResourceDto } from "./syllabus-unit-resources.dto";
import { TeacherPortalMenuService } from "./teacher-portal-menu.service";
import { mergeTeacherPortalModules } from "../permissions/teacher-portal-modules";
import { TeacherPortalSyllabusService } from "./teacher-portal-syllabus.service";
import { TeacherPortalSubjectsService } from "./teacher-portal-subjects.service";
import { TeacherCreateSubjectDto, TeacherSubjectListQueryDto, TeacherUpdateSubjectDto } from "./teacher-subjects-portal.dto";
import {
  TeacherSyllabusCompletionQueryDto,
  TeacherSyllabusCreateSyllabusDto,
  TeacherSyllabusSectionSubjectsQueryDto,
  TeacherSyllabusTopicBodyDto,
  TeacherSyllabusTopicCompletionDto,
  TeacherSyllabusUnitBodyDto
} from "./teacher-syllabus-portal.dto";
import {
  AnnouncementAudience,
  AnnouncementStatus,
  AnnouncementTeacherScope,
  PermissionAction,
  Prisma,
  ResultEntryStatus,
  StructureStatus,
  StudentApplicationStatus,
  TeacherRoleKind,
  TimetableSlotStatus,
  UserStatus,
  UserType
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { StudentAnnouncementsQueryDto } from "./student-announcements-portal.dto";
import { StudentPortalAnnouncementsService } from "./student-portal-announcements.service";
import { StudentPortalNotificationsService } from "./student-portal-notifications.service";
import { StudentNotificationsQueryDto } from "./student-notifications-portal.dto";
import { PortalNotificationsQueryDto } from "./portal-notifications.dto";
import { StudentFeedbackFormsQueryDto, StudentFeedbackSubmitDto } from "./student-feedback-portal.dto";
import { StudentPortalFeedbackService } from "./student-portal-feedback.service";
import { StudentPortalProfileService } from "./student-portal-profile.service";
import { UpdateStudentProfileDto } from "./student-profile-portal.dto";
import { AdminPortalDashboardService } from "./admin-portal-dashboard.service";
import { TeacherPortalNotificationsService } from "./teacher-portal-notifications.service";
import { HtpoSectionAttendanceQueryDto } from "./htpo-attendance.dto";
import { TeacherPortalDashboardService } from "./teacher-portal-dashboard.service";
import { TeacherPortalHtpoAttendanceService } from "./teacher-portal-htpo-attendance.service";
import { TeacherPortalTimetableService } from "./teacher-portal-timetable.service";
import { TeacherAssignSubjectTeacherDto, TeacherTimetableAddSlotsDto, TeacherTimetableArchivePeriodDto, TeacherTimetableAssignOptionsQueryDto, TeacherUnassignSubjectTeacherDto } from "./teacher-timetable-portal.dto";
import { PORTAL_UI_POLICY } from "./portal-ui.constants";
import { TeacherPortalResultsService } from "./teacher-portal-results.service";
import { TeacherPortalTeamsService } from "./teacher-portal-teams.service";
import { TeacherPortalFinanceService } from "./teacher-portal-finance.service";
import {
  TeacherResultsBulkUpsertDto,
  TeacherResultsSectionQueryDto,
  TeacherResultsStudentSearchDto
} from "./teacher-results-portal.dto";
import {
  TeacherTeamCreateDto,
  TeacherTeamsListQueryDto,
  TeacherTeamsStudentSearchDto,
  TeacherTeamUpdateMembersDto
} from "./teacher-teams-portal.dto";
import {
  TeacherFinanceExportQueryDto,
  TeacherFinancePendingStudentsQueryDto,
  TeacherFinanceRecentPaymentsQueryDto,
  TeacherFinanceScopeQueryDto,
  TeacherFinanceStudentsQueryDto
} from "./teacher-finance-portal.dto";
import { PortalReportsService } from "../reports/portal-reports.service";
import {
  PortalReportsDashboardQueryDto,
  PortalReportsExportQueryDto
} from "../reports/portal-reports.dto";
import { TeacherPortalEngageService } from "./teacher-portal-engage.service";
import { TeacherPortalStudentsService } from "./teacher-portal-students.service";
import { TeacherPortalStudentSearchService, PROFILE_CARDS, type ProfileCard } from "./teacher-portal-student-search.service";
import { TeacherPortalSectionOverviewService } from "./teacher-portal-section-overview.service";
import { StudentSearchQueryDto, StudentProfileExportQueryDto, TeacherStudentProfileEditDto } from "./teacher-student-search.dto";
import { SectionOverviewExportQueryDto, SectionOverviewQueryDto } from "./teacher-section-overview.dto";
import { getRequestContext } from "../auth/request-context";
import { BulkCreateStudentsDto, CreateStudentDto, ResetStudentPasswordDto, StudentListQueryDto, UpdateStudentDto } from "../students/students.dto";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("portals")
export class PortalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentPortalAnnouncements: StudentPortalAnnouncementsService,
    private readonly studentPortalNotifications: StudentPortalNotificationsService,
    private readonly studentPortalDashboard: StudentPortalDashboardService,
    private readonly studentPortalAttendance: StudentPortalAttendanceService,
    private readonly studentPortalTimetable: StudentPortalTimetableService,
    private readonly studentPortalMarks: StudentPortalMarksService,
    private readonly studentPortalSubjects: StudentPortalSubjectsService,
    private readonly studentPortalFees: StudentPortalFeesService,
    private readonly studentPortalReceipts: StudentPortalReceiptsService,
    private readonly studentPortalFeedback: StudentPortalFeedbackService,
    private readonly studentPortalProfile: StudentPortalProfileService,
    private readonly syllabusUnitResources: SyllabusUnitResourcesService,
    private readonly teacherPortalSyllabus: TeacherPortalSyllabusService,
    private readonly teacherPortalSubjects: TeacherPortalSubjectsService,
    private readonly teacherPortalMenu: TeacherPortalMenuService,
    private readonly teacherPortalNotifications: TeacherPortalNotificationsService,
    private readonly adminPortalDashboard: AdminPortalDashboardService,
    private readonly teacherPortalDashboard: TeacherPortalDashboardService,
    private readonly teacherPortalHtpoAttendance: TeacherPortalHtpoAttendanceService,
    private readonly teacherPortalTimetable: TeacherPortalTimetableService,
    private readonly teacherPortalResults: TeacherPortalResultsService,
    private readonly teacherPortalTeams: TeacherPortalTeamsService,
    private readonly teacherPortalFinance: TeacherPortalFinanceService,
    private readonly portalReports: PortalReportsService,
    private readonly teacherPortalEngage: TeacherPortalEngageService,
    private readonly teacherPortalStudents: TeacherPortalStudentsService,
    private readonly teacherPortalStudentSearch: TeacherPortalStudentSearchService,
    private readonly teacherPortalSectionOverview: TeacherPortalSectionOverviewService
  ) {}

  @Get("admin")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  admin(@CurrentUser() user: AuthUser) {
    return {
      portal: "ADMIN",
      userId: user.id,
      sections: ["Overview", "Academics", "Structure", "Finance", "Engage"],
      ui: PORTAL_UI_POLICY
    };
  }

  @Get("admin/dashboard")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  adminDashboard(@CurrentUser() user: AuthUser) {
    return this.adminPortalDashboard.summary(user);
  }

  @Get("admin/dashboard/fee-collection/daily")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  adminFeeCollectionDaily(@CurrentUser() user: AuthUser) {
    return this.adminPortalDashboard.dailyCollectionBreakdown(user);
  }

  @Get("admin/dashboard/fee-collection/days/:date")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  adminFeeCollectionDayPayments(@CurrentUser() user: AuthUser, @Param("date") date: string) {
    return this.adminPortalDashboard.dayPayments(user, date);
  }

  @Get("teacher")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacher(@CurrentUser() user: AuthUser) {
    return {
      portal: "TEACHER",
      userId: user.id,
      ui: PORTAL_UI_POLICY,
      activeRoles: user.assignments.map((assignment) => ({
        role: assignment.role,
        scope: {
          campusGroupId: assignment.campusGroupId,
          campusId: assignment.campusId,
          programId: assignment.programId,
          branchId: assignment.branchId,
          batchId: assignment.batchId,
          classId: assignment.classId,
          sectionId: assignment.sectionId,
          subjectId: assignment.subjectId
        }
      }))
    };
  }

  @Get("teacher/menu")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  async teacherMenu(@CurrentUser() user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    return this.teacherPortalMenu.buildMenu(teacher.assignments.map((assignment) => assignment.role));
  }

  @Get("teacher/dashboard")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  async teacherDashboard(@CurrentUser() user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    const assignments = teacher.assignments.map((assignment) => this.toTeacherScopeObject(assignment));
    const studentWhere = this.studentWhereForAssignments(teacher.assignments);
    const timetableWhere = this.timetableWhereForAssignments(teacher.id, teacher.assignments);
    const today = this.todayDayOfWeek();
    const notif = await this.teacherPortalNotifications.unreadCount(user);
    const [students, pendingApplications, teams, resultIssues, todaySlots, announcements] = await Promise.all([
      this.prisma.studentProfile.count({ where: studentWhere }),
      this.prisma.studentApplication.count({ where: { status: StudentApplicationStatus.PENDING, studentProfile: studentWhere } }),
      this.prisma.studentTeam.count({ where: { status: "ACTIVE", OR: this.sectionWhereForAssignments(teacher.assignments) } }),
      this.prisma.resultEntry.count({ where: { status: { in: [ResultEntryStatus.FAIL, ResultEntryStatus.ABSENT, ResultEntryStatus.WITHHELD] }, studentProfile: studentWhere } }),
      this.prisma.timetableSlot.findMany({
        where: { status: TimetableSlotStatus.ACTIVE, dayOfWeek: today, OR: timetableWhere },
        include: { campus: true, program: true, branch: true, batch: true, class: true, section: true, subject: true, teacherProfile: { include: { user: true } } },
        orderBy: [{ startTime: "asc" }],
        take: 12
      }),
      this.prisma.announcement.findMany({
        where: {
          status: AnnouncementStatus.PUBLISHED,
          OR: [...this.announcementWhereForAssignments(teacher.assignments), ...this.announcementTeacherTargetOr(teacher.assignments)]
        },
        orderBy: { publishedAt: "desc" },
        take: 5
      })
    ]);

    const htpoAssignments = teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO);
    let htpoOverview: Awaited<ReturnType<TeacherPortalDashboardService["buildHtpoOverview"]>> = null;
    if (htpoAssignments.length) {
      try {
        htpoOverview = await this.teacherPortalDashboard.buildHtpoOverview(
          htpoAssignments.map((a) => ({
            campusId: a.campusId,
            programId: a.programId,
            branchId: a.branchId,
            program: a.program ? { name: a.program.name } : null
          }))
        );
      } catch (err) {
        console.error("[teacher/dashboard] htpoOverview failed", err);
      }
    }

    return {
      teacher: {
        id: teacher.id,
        fullName: teacher.user.fullName,
        employeeCode: teacher.employeeCode,
        email: teacher.user.email
      },
      assignments,
      counts: {
        students,
        pendingApplications,
        teams,
        resultIssues,
        todayClasses: todaySlots.length,
        announcements: notif.announcements
      },
      htpoOverview,
      todayTimetable: todaySlots.map((slot) => this.toTimetableObject(slot)),
      announcements: announcements.map((announcement) => ({ id: announcement.id, title: announcement.title, audience: announcement.audience, publishedAt: announcement.publishedAt })),
      menu: this.teacherPortalMenu.buildMenu(teacher.assignments.map((assignment) => assignment.role))
    };
  }

  @Get("teacher/structure")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherStructure(@CurrentUser() user: AuthUser) {
    return this.teacherPortalDashboard.getTeacherStructure(user.id);
  }

  @Get("teacher/timetable/subject-teachers")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableSubjectTeachers(@CurrentUser() user: AuthUser) {
    return this.teacherPortalTimetable.listSubjectTeacherRows(user);
  }

  @Get("teacher/timetable/subject-teachers/options")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableSubjectTeacherOptions(
    @CurrentUser() user: AuthUser,
    @Query() query: TeacherTimetableAssignOptionsQueryDto
  ) {
    return this.teacherPortalTimetable.getAssignSubjectTeacherOptions(user, query.pickSectionId, query.pickSubjectId);
  }

  @Post("teacher/timetable/subject-teachers")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableAssignSubjectTeacher(@CurrentUser() user: AuthUser, @Body() dto: TeacherAssignSubjectTeacherDto) {
    return this.teacherPortalTimetable.assignSubjectTeacher(user, dto);
  }

  @Post("teacher/timetable/subject-teachers/unassign")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableUnassignSubjectTeacher(@CurrentUser() user: AuthUser, @Body() dto: TeacherUnassignSubjectTeacherDto) {
    return this.teacherPortalTimetable.unassignSubjectTeacher(user, dto.sectionId, dto.subjectId);
  }

  @Get("teacher/timetable/yours")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherYourTimetable(@CurrentUser() user: AuthUser) {
    return this.teacherPortalTimetable.listYourTimetable(user);
  }

  @Get("teacher/timetable/sections")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableSections(@CurrentUser() user: AuthUser) {
    return this.teacherPortalTimetable.listSupervisionSections(user);
  }

  @Get("teacher/timetable/sections/:sectionId")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableSectionGrid(@CurrentUser() user: AuthUser, @Param("sectionId") sectionId: string) {
    return this.teacherPortalTimetable.getSectionTimetableGrid(user, sectionId);
  }

  @Post("teacher/timetable/sections/:sectionId/periods/archive")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableArchivePeriod(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Body() dto: TeacherTimetableArchivePeriodDto
  ) {
    return this.teacherPortalTimetable.archivePeriod(user, sectionId, dto.startTime, dto.endTime);
  }

  @Post("teacher/timetable/sections/:sectionId/slots/:slotId/archive")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableArchiveSlot(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Param("slotId") slotId: string
  ) {
    return this.teacherPortalTimetable.archiveSlot(user, sectionId, slotId);
  }

  @Post("teacher/timetable/sections/:sectionId/slots")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableAddSlots(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Body() dto: TeacherTimetableAddSlotsDto
  ) {
    return this.teacherPortalTimetable.addSlots(user, sectionId, dto);
  }

  @Get("teacher/results/setup")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalResults.getSetup(user);
  }

  @Get("teacher/results/sections/:sectionId/semesters")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsSemesters(@CurrentUser() user: AuthUser, @Param("sectionId") sectionId: string) {
    return this.teacherPortalResults.listSemesters(user, sectionId);
  }

  @Get("teacher/results/sections/:sectionId/students")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsSearchStudents(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Query() query: TeacherResultsStudentSearchDto
  ) {
    return this.teacherPortalResults.searchStudents(user, sectionId, query);
  }

  @Get("teacher/results/sections/:sectionId/view")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsSectionView(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Query() query: TeacherResultsSectionQueryDto
  ) {
    return this.teacherPortalResults.getSectionResultsView(user, sectionId, query);
  }

  @Get("teacher/results/students/:studentProfileId/semesters")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsStudentSemesters(@CurrentUser() user: AuthUser, @Param("studentProfileId") studentProfileId: string) {
    return this.teacherPortalResults.getStudentAllSemesters(user, studentProfileId);
  }

  @Get("teacher/results/students/:studentProfileId/semesters/:semesterNumber/form")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  teacherResultsStudentSemesterForm(
    @CurrentUser() user: AuthUser,
    @Param("studentProfileId") studentProfileId: string,
    @Param("semesterNumber") semesterNumber: string
  ) {
    return this.teacherPortalResults.getStudentSemesterForm(user, studentProfileId, Number(semesterNumber));
  }

  @Post("teacher/results/bulk")
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS, { skipRequestScope: true })
  teacherResultsBulkUpsert(@CurrentUser() user: AuthUser, @Body() dto: TeacherResultsBulkUpsertDto) {
    return this.teacherPortalResults.bulkUpsert(user, dto);
  }

  @Get("teacher/results/imports/:jobId")
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS)
  teacherResultsImportJob(@CurrentUser() user: AuthUser, @Param("jobId") jobId: string) {
    return this.teacherPortalResults.getImportJob(user, jobId);
  }

  @Post("teacher/results/imports/:jobId/cancel")
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS)
  teacherResultsCancelImport(@CurrentUser() user: AuthUser, @Param("jobId") jobId: string) {
    return this.teacherPortalResults.cancelImportJob(user, jobId);
  }

  @Get("teacher/teams/setup")
  @RequiresPermission(PermissionAction.VIEW_TEAMS)
  teacherTeamsSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalTeams.getSetup(user);
  }

  @Get("teacher/teams")
  // sectionId arrives as a query param; the service scopes it to the teacher's
  // sections (rejecting out-of-scope ids). Skip the guard's scope check, which
  // can't resolve a bare sectionId against a branch-level (HTPO) assignment.
  @RequiresPermission(PermissionAction.VIEW_TEAMS, { skipRequestScope: true })
  teacherTeamsList(@CurrentUser() user: AuthUser, @Query() query: TeacherTeamsListQueryDto) {
    return this.teacherPortalTeams.listTeams(user, query);
  }

  @Get("teacher/teams/sections/:sectionId/students")
  @RequiresPermission(PermissionAction.MANAGE_TEAMS)
  teacherTeamsSearchStudents(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Query() query: TeacherTeamsStudentSearchDto
  ) {
    return this.teacherPortalTeams.searchStudents(user, sectionId, query);
  }

  @Get("teacher/teams/:teamId")
  @RequiresPermission(PermissionAction.VIEW_TEAMS)
  teacherTeamDetail(@CurrentUser() user: AuthUser, @Param("teamId") teamId: string) {
    return this.teacherPortalTeams.getTeam(user, teamId);
  }

  @Post("teacher/teams")
  @RequiresPermission(PermissionAction.MANAGE_TEAMS, { skipRequestScope: true })
  teacherTeamsCreate(@CurrentUser() user: AuthUser, @Body() dto: TeacherTeamCreateDto) {
    return this.teacherPortalTeams.createTeam(user, dto);
  }

  @Patch("teacher/teams/:teamId/members")
  @RequiresPermission(PermissionAction.MANAGE_TEAMS, { skipRequestScope: true })
  teacherTeamsUpdateMembers(
    @CurrentUser() user: AuthUser,
    @Param("teamId") teamId: string,
    @Body() dto: TeacherTeamUpdateMembersDto
  ) {
    return this.teacherPortalTeams.updateMembers(user, teamId, dto);
  }

  @Post("teacher/teams/:teamId/archive")
  @RequiresPermission(PermissionAction.MANAGE_TEAMS)
  teacherTeamsArchive(@CurrentUser() user: AuthUser, @Param("teamId") teamId: string) {
    return this.teacherPortalTeams.archiveTeam(user, teamId);
  }

  @Get("teacher/finance/setup")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  teacherFinanceSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalFinance.getSetup(user);
  }

  @Get("teacher/finance/summary")
  // Section filter is a query param; teacherPortalFinance scopes it to the teacher's
  // own sections. Guard scope-check skipped (can't match a bare sectionId to an
  // HTPO's branch-level assignment) — see teacher/teams above.
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinanceSummary(@CurrentUser() user: AuthUser, @Query() query: TeacherFinanceScopeQueryDto) {
    return this.teacherPortalFinance.getSummary(user, query);
  }

  @Get("teacher/finance/recent-payments")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinanceRecentPayments(@CurrentUser() user: AuthUser, @Query() query: TeacherFinanceRecentPaymentsQueryDto) {
    return this.teacherPortalFinance.listRecentPayments(user, query);
  }

  @Get("teacher/finance/pending-students")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinancePendingStudents(@CurrentUser() user: AuthUser, @Query() query: TeacherFinancePendingStudentsQueryDto) {
    return this.teacherPortalFinance.listPendingStudents(user, query);
  }

  @Get("teacher/finance/students")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinanceStudents(@CurrentUser() user: AuthUser, @Query() query: TeacherFinanceStudentsQueryDto) {
    return this.teacherPortalFinance.listStudentFeeStatus(user, query);
  }

  @Get("teacher/finance/section-collection")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinanceSectionCollection(@CurrentUser() user: AuthUser, @Query() query: TeacherFinanceScopeQueryDto) {
    return this.teacherPortalFinance.getSectionCollection(user, query);
  }

  @Get("teacher/finance/payment-status")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinancePaymentStatus(@CurrentUser() user: AuthUser, @Query() query: TeacherFinanceScopeQueryDto) {
    return this.teacherPortalFinance.getPaymentStatusBreakdown(user, query);
  }

  @Get("teacher/finance/students/export")
  @RequiresPermission(PermissionAction.VIEW_FEES, { skipRequestScope: true })
  teacherFinanceStudentsExport(
    @CurrentUser() user: AuthUser,
    @Query() query: TeacherFinanceExportQueryDto,
    @Res() response: Response
  ) {
    return this.teacherPortalFinance.exportStudentFeeStatus(user, query, response);
  }

  @Post("teacher/finance/students/:studentProfileId/remind")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  teacherFinanceRemindStudent(@CurrentUser() user: AuthUser, @Param("studentProfileId") studentProfileId: string) {
    return this.teacherPortalFinance.remindStudent(user, studentProfileId);
  }

  @Get("teacher/reports/setup")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  teacherReportsSetup(@CurrentUser() user: AuthUser) {
    return this.portalReports.getSetup(user);
  }

  @Get("teacher/reports/dashboard")
  // sectionId is a query param; portalReports scopes it to the teacher's sections
  // (rejecting out-of-scope ids). Guard scope-check skipped — see teacher/finance.
  @RequiresPermission(PermissionAction.VIEW_REPORTS, { skipRequestScope: true })
  teacherReportsDashboard(@CurrentUser() user: AuthUser, @Query() query: PortalReportsDashboardQueryDto) {
    return this.portalReports.getDashboard(user, query);
  }

  @Get("teacher/reports/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS, { skipRequestScope: true })
  teacherReportsExport(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalReportsExportQueryDto,
    @Res() response: Response
  ) {
    return this.portalReports.exportReport(user, query, response);
  }

  @Get("teacher/attendance/setup")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  teacherAttendanceSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalHtpoAttendance.getSetup(user);
  }

  @Get("teacher/timetable/setup")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherTimetableSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalTimetable.getSetup(user);
  }

  @Get("teacher/engage/setup")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherEngageSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalEngage.getSetup(user);
  }

  @Get("teacher/htpo/sections/:sectionId/mark-setup")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherHtpoSectionMarkSetup(@CurrentUser() user: AuthUser, @Param("sectionId") sectionId: string) {
    return this.teacherPortalHtpoAttendance.getMarkSetup(user, sectionId);
  }

  @Get("teacher/htpo/sections/:sectionId")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  async teacherHtpoSectionDetail(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Query() query: HtpoSectionAttendanceQueryDto
  ) {
    return this.teacherPortalHtpoAttendance.getSectionAttendanceDetail(user, sectionId, query);
  }

  @Get("teacher/htpo/sections/:sectionId/students/:studentProfileId")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  async teacherHtpoStudentAttendanceDetail(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Param("studentProfileId") studentProfileId: string,
    @Query() query: HtpoSectionAttendanceQueryDto
  ) {
    return this.teacherPortalHtpoAttendance.getStudentAttendanceDetail(user, sectionId, studentProfileId, query);
  }

  @Get("teacher/notifications/unread-count")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherNotificationsUnread(@CurrentUser() user: AuthUser) {
    return this.teacherPortalNotifications.unreadCount(user);
  }

  @Get("teacher/notifications")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherNotificationsList(@CurrentUser() user: AuthUser, @Query() query: PortalNotificationsQueryDto) {
    return this.teacherPortalNotifications.listFeed(user, query);
  }

  @Post("teacher/notifications/mark-all-read")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherNotificationsMarkAllRead(@CurrentUser() user: AuthUser) {
    return this.teacherPortalNotifications.markAllRead(user);
  }

  @Post("teacher/notifications/:notificationId/read")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  teacherNotificationMarkRead(@CurrentUser() user: AuthUser, @Param("notificationId") notificationId: string) {
    return this.teacherPortalNotifications.markNotificationRead(user, decodeURIComponent(notificationId));
  }

  @Get("teacher/students")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  async teacherStudents(@CurrentUser() user: AuthUser, @Query() query: { assignmentId?: string; page?: number; pageSize?: number; search?: string }) {
    const teacher = await this.getActiveTeacher(user.id);
    const pagination = toPagination({ page: query.page ?? 1, pageSize: query.pageSize ?? 25, search: query.search });
    const selectedAssignments = query.assignmentId ? teacher.assignments.filter((assignment) => assignment.id === query.assignmentId) : teacher.assignments;
    if (!selectedAssignments.length) throw new NotFoundException("Teacher assignment not found.");
    const where: Prisma.StudentProfileWhereInput = {
      ...this.studentWhereForAssignments(selectedAssignments),
      ...(query.search
        ? {
            OR: [
              { rollNumber: { contains: query.search, mode: "insensitive" } },
              { user: { fullName: { contains: query.search, mode: "insensitive" } } },
              { user: { email: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: true,
          section: { include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } } },
          attendanceEntries: { select: { status: true }, take: 100 },
          feeAssignments: { include: { feeStructure: true } },
          resultEntries: { select: { status: true } }
        },
        orderBy: { rollNumber: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentProfile.count({ where })
    ]);
    return {
      items: items.map((student) => {
        const present = student.attendanceEntries.filter((entry) => entry.status === "PRESENT").length;
        const totalAttendance = student.attendanceEntries.length;
        const due = student.feeAssignments.reduce((sum, assignment) => sum + Number(assignment.feeStructure.amount), 0);
        const failed = student.resultEntries.filter((entry) => entry.status === "FAIL" || entry.status === "ABSENT" || entry.status === "WITHHELD").length;
        return {
          id: student.id,
          rollNumber: student.rollNumber,
          fullName: student.user.fullName,
          email: student.user.email.endsWith("@students.local") ? null : student.user.email,
          section: student.section.name,
          class: student.section.class.label,
          semester: student.section.class.semesterNumber,
          branch: student.section.class.batch.branch.name,
          department: student.section.class.batch.branch.program.name,
          campus: student.section.class.batch.branch.program.campus.code,
          attendance: { total: totalAttendance, present, percentage: totalAttendance ? Math.round((present / totalAttendance) * 10000) / 100 : 0 },
          fees: { assigned: student.feeAssignments.length, due },
          results: { entries: student.resultEntries.length, issues: failed }
        };
      }),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  // --- Student management (HTPO/CTPO only; STPO rejected in service). Scoped to the
  // teacher's own sections. Guard only checks portal access; the service enforces role
  // + section scope and delegates writes to the admin StudentsService.
  // --- Search Student (Page 1): scoped read. Service enforces HTPO/CTPO + section scope
  // and treats out-of-scope ids as not-found (IDOR-safe).
  @Get("teacher/student-search")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentSearch(@CurrentUser() user: AuthUser, @Query() query: StudentSearchQueryDto) {
    return this.teacherPortalStudentSearch.search(user, query);
  }

  @Get("teacher/student-search/:studentProfileId")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentSearchProfile(@CurrentUser() user: AuthUser, @Param("studentProfileId") studentProfileId: string) {
    return this.teacherPortalStudentSearch.profile(user, studentProfileId);
  }

  @Get("teacher/student-search/:studentProfileId/export")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentSearchExport(
    @CurrentUser() user: AuthUser,
    @Param("studentProfileId") studentProfileId: string,
    @Query() query: StudentProfileExportQueryDto,
    @Res() response: Response
  ) {
    const safeCard = (query.card && PROFILE_CARDS.includes(query.card as ProfileCard) ? query.card : "all") as ProfileCard;
    return this.teacherPortalStudentSearch.exportProfile(user, studentProfileId, query.format, response, safeCard);
  }

  // Edit personal/login fields (section/campus excluded). Audited old→new + IP.
  @Patch("teacher/student-search/:studentProfileId")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentSearchUpdate(
    @CurrentUser() user: AuthUser,
    @Param("studentProfileId") studentProfileId: string,
    @Body() dto: TeacherStudentProfileEditDto,
    @Req() request: Request
  ) {
    return this.teacherPortalStudentSearch.updateProfile(user, studentProfileId, dto, getRequestContext(request));
  }

  // --- Section Overview (Page 2): team-wise grouping, overdue-first. Scoped + IDOR.
  @Get("teacher/section-overview/setup")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherSectionOverviewSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalSectionOverview.setup(user);
  }

  @Get("teacher/section-overview")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherSectionOverview(@CurrentUser() user: AuthUser, @Query() query: SectionOverviewQueryDto) {
    return this.teacherPortalSectionOverview.overview(user, query);
  }

  @Get("teacher/section-overview/export")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherSectionOverviewExport(@CurrentUser() user: AuthUser, @Query() query: SectionOverviewExportQueryDto, @Res() response: Response) {
    return this.teacherPortalSectionOverview.exportOverview(user, query, query.format, response);
  }

  @Get("teacher/students/setup")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalStudents.setup(user);
  }

  @Get("teacher/students/catalog")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsCatalog(@CurrentUser() user: AuthUser) {
    return this.teacherPortalStudents.catalog(user);
  }

  @Get("teacher/students/manage")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsManageList(@CurrentUser() user: AuthUser, @Query() query: StudentListQueryDto) {
    return this.teacherPortalStudents.list(user, query);
  }

  @Post("teacher/students/manage")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsCreate(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.teacherPortalStudents.create(user, dto);
  }

  @Post("teacher/students/manage/bulk")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsBulk(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateStudentsDto) {
    return this.teacherPortalStudents.bulk(user, dto);
  }

  @Get("teacher/students/manage/imports/:jobId")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsImportJob(@CurrentUser() user: AuthUser, @Param("jobId") jobId: string) {
    return this.teacherPortalStudents.getImportJob(user, jobId);
  }

  @Get("teacher/students/manage/:id")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsManageGet(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teacherPortalStudents.get(user, id);
  }

  @Patch("teacher/students/manage/:id")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsUpdate(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateStudentDto) {
    return this.teacherPortalStudents.update(user, id, dto);
  }

  @Post("teacher/students/manage/:id/deactivate")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsDeactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teacherPortalStudents.deactivate(user, id);
  }

  @Post("teacher/students/manage/:id/reactivate")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsReactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teacherPortalStudents.reactivate(user, id);
  }

  @Post("teacher/students/manage/:id/reset-password")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsResetPassword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ResetStudentPasswordDto) {
    return this.teacherPortalStudents.resetPassword(user, id, dto);
  }

  @Delete("teacher/students/manage/:id")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL, { skipRequestScope: true })
  teacherStudentsArchive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teacherPortalStudents.archive(user, id);
  }

  @Get("student")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  student(@CurrentUser() user: AuthUser) {
    return {
      portal: "STUDENT",
      userId: user.id,
      sections: ["Attendance", "Fees", "Applications", "Marks"],
      ui: PORTAL_UI_POLICY
    };
  }

  @Get("student/dashboard")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentDashboard(@CurrentUser() user: AuthUser) {
    return this.studentPortalDashboard.getDashboard(user);
  }

  @Get("student/dashboard/attendance-summary")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentDashboardAttendance(@CurrentUser() user: AuthUser, @Query() query: StudentAttendanceHistoryQueryDto) {
    return this.studentPortalDashboard.getAttendanceSummary(user, query.limit ?? 60);
  }

  @Get("student/dashboard/fee-summary")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentDashboardFees(@CurrentUser() user: AuthUser) {
    return this.studentPortalDashboard.getFeeSummary(user);
  }

  @Get("student/fees/status")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeeStatus(@CurrentUser() user: AuthUser) {
    return this.studentPortalFees.getFeeStatusPage(user);
  }

  @Get("student/fees/status/export/pdf")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeeStatusPdf(@CurrentUser() user: AuthUser, @Res({ passthrough: false }) res: Response) {
    const { buffer, contentType, filename } = await this.studentPortalFees.exportFeeStatusPdf(user);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(buffer);
  }

  @Get("student/fees/receipts")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeeReceipts(@CurrentUser() user: AuthUser) {
    return this.studentPortalReceipts.getReceiptsPage(user);
  }

  @Get("student/fees/payments/:paymentId/receipt/pdf")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeeReceiptPdf(
    @CurrentUser() user: AuthUser,
    @Param("paymentId") paymentId: string,
    @Res({ passthrough: false }) res: Response
  ) {
    const { buffer, contentType, filename } = await this.studentPortalFees.exportPaymentReceiptPdf(user, paymentId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(buffer);
  }

  @Get("student/fees/assignments/:assignmentId/receipt/pdf")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeeAssignmentReceiptPdf(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId") assignmentId: string,
    @Res({ passthrough: false }) res: Response
  ) {
    const { buffer, contentType, filename } = await this.studentPortalFees.exportAssignmentReceiptPdf(user, assignmentId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(buffer);
  }

  @Post("student/fees/payments/initiate")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeePaymentInitiate(@CurrentUser() user: AuthUser, @Body() dto: StudentFeePaymentInitiateDto) {
    return this.studentPortalFees.initiateOnlinePayment(user, dto.assignmentId);
  }

  @Get("student/attendance")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAttendancePage(@CurrentUser() user: AuthUser, @Query() query: StudentAttendancePageQueryDto) {
    return this.studentPortalAttendance.getAttendancePage(user, query);
  }

  @Get("student/attendance/export")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAttendanceExport(
    @CurrentUser() user: AuthUser,
    @Query() query: StudentAttendanceExportQueryDto,
    @Res({ passthrough: false }) res: Response
  ) {
    const { buffer, contentType, filename } = await this.studentPortalAttendance.exportAttendance(user, query);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(buffer);
  }

  @Get("student/timetable")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentTimetable(@CurrentUser() user: AuthUser, @Query() _query: StudentTimetableQueryDto) {
    return this.studentPortalTimetable.getSectionTimetableGrid(user);
  }

  @Get("student/marks")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentMarks(@CurrentUser() user: AuthUser) {
    return this.studentPortalMarks.getMarksPage(user);
  }

  @Get("student/marks/export/pdf")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentMarksPdf(
    @CurrentUser() user: AuthUser,
    @Query() query: StudentMarksPdfQueryDto,
    @Res({ passthrough: false }) res: Response
  ) {
    const { buffer, contentType, filename } = await this.studentPortalMarks.exportSemesterPdf(user, query);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.send(buffer);
  }

  @Get("student/subjects/semesters")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentSubjectSemesters(@CurrentUser() user: AuthUser) {
    return this.studentPortalSubjects.listSemesters(user);
  }

  @Get("student/subjects")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentMySubjects(@CurrentUser() user: AuthUser, @Query() query: StudentSubjectsQueryDto) {
    return this.studentPortalSubjects.listMySubjects(user, query.semesterNumber);
  }

  @Get("student/subjects/:subjectId/syllabus")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentSubjectSyllabus(
    @CurrentUser() user: AuthUser,
    @Param("subjectId") subjectId: string,
    @Query() query: StudentSubjectsQueryDto
  ) {
    return this.studentPortalSubjects.getSubjectSyllabus(user, subjectId, query.semesterNumber);
  }

  @Get("teacher/subjects/setup")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSubjectsSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalSubjects.getSetup(user);
  }

  @Get("teacher/subjects")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSubjectsList(@CurrentUser() user: AuthUser, @Query() query: TeacherSubjectListQueryDto) {
    return this.teacherPortalSubjects.listSubjects(user, query.sectionId, query.semesterNumber);
  }

  @Post("teacher/subjects")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE, { skipRequestScope: true })
  teacherSubjectsCreate(@CurrentUser() user: AuthUser, @Body() dto: TeacherCreateSubjectDto) {
    return this.teacherPortalSubjects.createSubject(user, dto);
  }

  @Put("teacher/subjects/:subjectId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE, { skipRequestScope: true })
  teacherSubjectsUpdate(
    @CurrentUser() user: AuthUser,
    @Param("subjectId") subjectId: string,
    @Body() dto: TeacherUpdateSubjectDto
  ) {
    return this.teacherPortalSubjects.updateSubject(user, subjectId, dto);
  }

  @Delete("teacher/subjects/:subjectId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE, { skipRequestScope: true })
  teacherSubjectsDelete(@CurrentUser() user: AuthUser, @Param("subjectId") subjectId: string) {
    return this.teacherPortalSubjects.archiveSubject(user, subjectId);
  }

  @Get("teacher/syllabus/setup")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusSetup(@CurrentUser() user: AuthUser) {
    return this.teacherPortalSyllabus.getSetup(user);
  }

  @Get("teacher/syllabus/subjects")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusSubjects(@CurrentUser() user: AuthUser) {
    return this.teacherPortalSyllabus.listSubjects(user);
  }

  @Get("teacher/syllabus/sections/:sectionId/subjects")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusSectionSubjects(
    @CurrentUser() user: AuthUser,
    @Param("sectionId") sectionId: string,
    @Query() query: TeacherSyllabusSectionSubjectsQueryDto
  ) {
    return this.teacherPortalSyllabus.listSectionSubjects(user, sectionId, query.semesterNumber);
  }

  @Get("teacher/syllabus/subjects/:subjectId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusSubjectDetail(@CurrentUser() user: AuthUser, @Param("subjectId") subjectId: string) {
    return this.teacherPortalSyllabus.getSubjectSyllabus(user, subjectId);
  }

  @Post("teacher/syllabus/subjects/:subjectId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusCreate(
    @CurrentUser() user: AuthUser,
    @Param("subjectId") subjectId: string,
    @Body() dto: TeacherSyllabusCreateSyllabusDto
  ) {
    return this.teacherPortalSyllabus.createSyllabus(user, subjectId, dto);
  }

  @Post("teacher/syllabus/subjects/:subjectId/units")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusCreateUnit(
    @CurrentUser() user: AuthUser,
    @Param("subjectId") subjectId: string,
    @Body() dto: TeacherSyllabusUnitBodyDto
  ) {
    return this.teacherPortalSyllabus.createUnit(user, subjectId, dto);
  }

  @Put("teacher/syllabus/units/:unitId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusUpdateUnit(
    @CurrentUser() user: AuthUser,
    @Param("unitId") unitId: string,
    @Body() dto: TeacherSyllabusUnitBodyDto
  ) {
    return this.teacherPortalSyllabus.updateUnit(user, unitId, dto);
  }

  @Delete("teacher/syllabus/units/:unitId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusDeleteUnit(@CurrentUser() user: AuthUser, @Param("unitId") unitId: string) {
    return this.teacherPortalSyllabus.archiveUnit(user, unitId);
  }

  @Post("teacher/syllabus/units/:unitId/topics")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusCreateTopic(
    @CurrentUser() user: AuthUser,
    @Param("unitId") unitId: string,
    @Body() dto: TeacherSyllabusTopicBodyDto
  ) {
    return this.teacherPortalSyllabus.createTopic(user, unitId, dto);
  }

  @Put("teacher/syllabus/topics/:topicId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusUpdateTopic(
    @CurrentUser() user: AuthUser,
    @Param("topicId") topicId: string,
    @Body() dto: TeacherSyllabusTopicBodyDto
  ) {
    return this.teacherPortalSyllabus.updateTopic(user, topicId, dto);
  }

  @Delete("teacher/syllabus/topics/:topicId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusDeleteTopic(@CurrentUser() user: AuthUser, @Param("topicId") topicId: string) {
    return this.teacherPortalSyllabus.archiveTopic(user, topicId);
  }

  @Get("teacher/syllabus/sections/:sectionId/semesters")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusSemesters(@CurrentUser() user: AuthUser, @Param("sectionId") sectionId: string) {
    return this.teacherPortalSyllabus.listSemesters(user, sectionId);
  }

  @Get("teacher/syllabus/completion")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  teacherSyllabusCompletion(@CurrentUser() user: AuthUser, @Query() query: TeacherSyllabusCompletionQueryDto) {
    return this.teacherPortalSyllabus.getCompletionChecklist(
      user,
      query.sectionId,
      query.subjectId,
      query.semesterNumber
    );
  }

  @Patch("teacher/syllabus/topic-completion")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  async teacherSyllabusTopicCompletion(@CurrentUser() user: AuthUser, @Body() dto: TeacherSyllabusTopicCompletionDto) {
    return this.teacherPortalSyllabus.setTopicCompletion(user, dto);
  }

  @Get("teacher/syllabus/units/:unitId/resources")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  async teacherUnitResources(
    @CurrentUser() user: AuthUser,
    @Param("unitId") unitId: string,
    @Query("sectionId") sectionId: string
  ) {
    if (!sectionId?.trim()) throw new NotFoundException("sectionId query is required.");
    return this.syllabusUnitResources.listForTeacher(user, unitId, sectionId.trim());
  }

  @Post("teacher/syllabus/units/:unitId/resources")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  async teacherCreateUnitResource(
    @CurrentUser() user: AuthUser,
    @Param("unitId") unitId: string,
    @Body() dto: CreateSyllabusUnitResourceDto
  ) {
    return this.syllabusUnitResources.createForTeacher(user, unitId, dto);
  }

  @Post("teacher/syllabus/units/:unitId/resources/pdf")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } }))
  async teacherUploadUnitPdf(
    @CurrentUser() user: AuthUser,
    @Param("unitId") unitId: string,
    @Query("sectionId") sectionId: string,
    @Query("title") title: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!sectionId?.trim()) throw new NotFoundException("sectionId query is required.");
    return this.syllabusUnitResources.uploadPdfForTeacher(user, unitId, sectionId.trim(), title ?? "", file);
  }

  @Delete("teacher/syllabus/resources/:resourceId")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  async teacherArchiveUnitResource(@CurrentUser() user: AuthUser, @Param("resourceId") resourceId: string) {
    return this.syllabusUnitResources.archiveForTeacher(user, resourceId);
  }

  @Get("student/notifications/unread-count")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentNotificationsUnreadCount(@CurrentUser() user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts use this endpoint.");
    }
    const unreadCount = await this.studentPortalNotifications.unreadCount(user.id);
    return { unreadCount, ...this.studentPortalNotifications.notificationsVersion(user.id) };
  }

  @Get("student/notifications")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentNotificationsList(@CurrentUser() user: AuthUser, @Query() query: StudentNotificationsQueryDto) {
    return this.studentPortalNotifications.listFeed(user, query);
  }

  @Post("student/notifications/mark-all-read")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentNotificationsMarkAllRead(@CurrentUser() user: AuthUser) {
    return this.studentPortalNotifications.markAllRead(user);
  }

  @Post("student/notifications/:notificationId/read")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentNotificationMarkRead(@CurrentUser() user: AuthUser, @Param("notificationId") notificationId: string) {
    return this.studentPortalNotifications.markNotificationRead(user, decodeURIComponent(notificationId));
  }

  @Get("student/engage/announcements")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAnnouncementsList(@CurrentUser() user: AuthUser, @Query() query: StudentAnnouncementsQueryDto) {
    return this.studentPortalAnnouncements.list(user, query);
  }

  @Get("student/engage/announcements/:announcementId")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAnnouncementDetail(@CurrentUser() user: AuthUser, @Param("announcementId") announcementId: string) {
    return this.studentPortalAnnouncements.getOne(user, announcementId);
  }

  @Post("student/engage/announcements/:announcementId/read")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAnnouncementMarkRead(@CurrentUser() user: AuthUser, @Param("announcementId") announcementId: string) {
    return this.studentPortalAnnouncements.markRead(user, announcementId);
  }

  @Get("student/engage/profile")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentProfileGet(@CurrentUser() user: AuthUser) {
    return this.studentPortalProfile.getProfile(user);
  }

  @Patch("student/engage/profile")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentProfileUpdate(@CurrentUser() user: AuthUser, @Body() dto: UpdateStudentProfileDto) {
    return this.studentPortalProfile.updateProfile(user, dto);
  }

  @Get("student/feedback/forms")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeedbackForms(@CurrentUser() user: AuthUser, @Query() query: StudentFeedbackFormsQueryDto) {
    return this.studentPortalFeedback.listForms(user, query);
  }

  @Get("student/feedback/forms/:formId")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeedbackForm(@CurrentUser() user: AuthUser, @Param("formId") formId: string) {
    return this.studentPortalFeedback.getForm(user, formId);
  }

  @Post("student/feedback/forms/:formId/submit")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentFeedbackSubmit(
    @CurrentUser() user: AuthUser,
    @Param("formId") formId: string,
    @Body() dto: StudentFeedbackSubmitDto
  ) {
    return this.studentPortalFeedback.submit(user, formId, dto);
  }

  @Get("student/academic")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  async studentAcademic(@CurrentUser() user: AuthUser) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: true,
        section: {
          include: {
            class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } },
            subjectAssignments: {
              where: { isActive: true, subject: { status: StructureStatus.ACTIVE, isArchived: false } },
              include: {
                subject: {
                  include: {
                    syllabi: {
                      where: { isArchived: false },
                      include: {
                        units: {
                          where: { isArchived: false },
                          orderBy: { unitOrder: "asc" },
                          include: { topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } } }
                        }
                      }
                    }
                  }
                }
              },
              orderBy: { subject: { code: "asc" } }
            },
            roleAssignments: {
              where: { isActive: true },
              include: { teacherProfile: { include: { user: true } }, subject: true }
            },
            timetableSlots: {
              where: { status: TimetableSlotStatus.ACTIVE },
              include: { subject: true, teacherProfile: { include: { user: true } } },
              orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
            },
            feeStructures: {
              where: { isActive: true, isArchived: false },
              include: { feeHead: true },
              orderBy: { createdAt: "desc" }
            },
            announcements: {
              where: { status: AnnouncementStatus.PUBLISHED },
              orderBy: { createdAt: "desc" },
              take: 10
            }
          }
        }
      }
    });
    if (!student) throw new NotFoundException("Student profile not found.");

    const section = student.section;
    const cls = section.class;
    const fallbackSubjects = section.subjectAssignments.length
      ? []
      : await this.prisma.subject.findMany({
          where: {
            branchId: cls.batch.branchId,
            semesterNumber: cls.semesterNumber,
            status: StructureStatus.ACTIVE,
            isArchived: false,
            OR: [{ batchId: cls.batchId }, { batchId: null }]
          },
          include: {
            syllabi: {
              where: { isArchived: false },
              include: {
                units: {
                  where: { isArchived: false },
                  orderBy: { unitOrder: "asc" },
                  include: { topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } } }
                }
              }
            }
          },
          orderBy: { code: "asc" }
        });
    const subjects = section.subjectAssignments.length ? section.subjectAssignments.map((item) => item.subject) : fallbackSubjects;

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        currentSectionId: section.id
      },
      section: {
        id: section.id,
        code: section.code,
        name: section.name,
        semester: cls.semesterNumber,
        class: cls.label,
        batch: cls.batch.batchCode,
        branch: cls.batch.branch.name,
        department: cls.batch.branch.program.name,
        campus: cls.batch.branch.program.campus.name
      },
      subjects: subjects.map((subject) => ({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        syllabi: subject.syllabi.map((syllabus) => ({
          id: syllabus.id,
          units: syllabus.units.map((unit) => ({
            id: unit.id,
            title: unit.unitTitle,
            order: unit.unitOrder,
            topics: unit.topics.map((topic) => ({ id: topic.id, title: topic.topicTitle, order: topic.topicOrder }))
          }))
        }))
      })),
      teachers: section.roleAssignments.map((assignment) => ({
        role: assignment.role,
        teacherId: assignment.teacherProfileId,
        name: assignment.teacherProfile.user.fullName,
        subjectCode: assignment.subject?.code ?? null
      })),
      timetable: section.timetableSlots.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
        subject: slot.subject?.name ?? null,
        teacher: slot.teacherProfile?.user.fullName ?? null
      })),
      feeStructures: section.feeStructures.map((fee) => ({
        id: fee.id,
        name: fee.feeHeadName ?? fee.feeHead.name,
        amount: Number(fee.amount),
        dueDate: fee.dueDate ? formatIstDate(fee.dueDate) : null
      })),
      announcements: section.announcements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        publishedAt: announcement.publishedAt
      }))
    };
  }

  @Get("database")
  @RequiresPermission(PermissionAction.VIEW_DB_PORTAL)
  database(@CurrentUser() user: AuthUser) {
    return { portal: "DATABASE", userId: user.id, mode: "read-only-first", tablesVisible: true, ui: PORTAL_UI_POLICY };
  }

  private async getActiveTeacher(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        assignments: {
          where: { isActive: true },
          include: { campusGroup: true, campus: true, program: true, branch: true, batch: true, class: true, section: true, subject: true, permissions: true },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    return teacher;
  }

  private toTeacherScopeObject(assignment: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"][number]) {
    const scopeParts = [
      assignment.campus?.code,
      assignment.program?.code,
      assignment.branch?.code,
      assignment.batch ? `${assignment.batch.startYear}-${assignment.batch.endYear}` : null,
      assignment.class?.label,
      assignment.section?.name,
      assignment.subject?.code
    ].filter(Boolean);
    return {
      id: assignment.id,
      role: assignment.role,
      scopeLabel: scopeParts.length ? scopeParts.join(" / ") : assignment.campusGroup?.name ?? "Assigned scope",
      campus: assignment.campus ? { id: assignment.campus.id, code: assignment.campus.code, name: assignment.campus.name } : null,
      department: assignment.program ? { id: assignment.program.id, code: assignment.program.code, name: assignment.program.name } : null,
      branch: assignment.branch ? { id: assignment.branch.id, code: assignment.branch.code, name: assignment.branch.name } : null,
      batch: assignment.batch ? { id: assignment.batch.id, startYear: assignment.batch.startYear, endYear: assignment.batch.endYear } : null,
      class: assignment.class ? { id: assignment.class.id, label: assignment.class.label, semesterNumber: assignment.class.semesterNumber } : null,
      section: assignment.section ? { id: assignment.section.id, name: assignment.section.name } : null,
      subject: assignment.subject ? { id: assignment.subject.id, code: assignment.subject.code, name: assignment.subject.name } : null,
      modules: mergeTeacherPortalModules([assignment.role])
    };
  }

  private studentWhereForAssignments(assignments: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"]): Prisma.StudentProfileWhereInput {
    const OR = assignments.map((assignment) => this.studentWhereForAssignment(assignment));
    return { currentStatus: UserStatus.ACTIVE, isArchived: false, OR: OR.length ? OR : [{ id: "__none__" }] };
  }

  private studentWhereForAssignment(assignment: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"][number]): Prisma.StudentProfileWhereInput {
    if (assignment.sectionId) return { sectionId: assignment.sectionId };
    if (assignment.classId) return { section: { classId: assignment.classId } };
    if (assignment.batchId) return { section: { class: { batchId: assignment.batchId } } };
    if (assignment.branchId) return { section: { class: { branchId: assignment.branchId } } };
    if (assignment.programId) return { section: { class: { branch: { programId: assignment.programId } } } };
    if (assignment.campusId) return { section: { campusId: assignment.campusId } };
    return { id: "__none__" };
  }

  private sectionWhereForAssignments(assignments: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"]): Prisma.StudentTeamWhereInput[] {
    return assignments.map((assignment) => {
      if (assignment.sectionId) return { sectionId: assignment.sectionId };
      if (assignment.classId) return { section: { classId: assignment.classId } };
      if (assignment.branchId) return { section: { class: { branchId: assignment.branchId } } };
      if (assignment.programId) return { section: { class: { branch: { programId: assignment.programId } } } };
      if (assignment.campusId) return { section: { campusId: assignment.campusId } };
      return { id: "__none__" };
    });
  }

  private timetableWhereForAssignments(teacherProfileId: string, assignments: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"]): Prisma.TimetableSlotWhereInput[] {
    return [{ teacherProfileId }, ...assignments.map((assignment) => {
      if (assignment.sectionId) return { sectionId: assignment.sectionId };
      if (assignment.classId) return { classId: assignment.classId };
      if (assignment.branchId) return { branchId: assignment.branchId };
      if (assignment.programId) return { programId: assignment.programId };
      if (assignment.campusId) return { campusId: assignment.campusId };
      return { id: "__none__" };
    })];
  }

  private announcementTeacherTargetOr(assignments: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"]): Prisma.AnnouncementWhereInput[] {
    const campusIds = [...new Set(assignments.map((a) => a.campusId).filter(Boolean))] as string[];
    const programIds = [...new Set(assignments.map((a) => a.programId).filter(Boolean))] as string[];
    const branchIds = [...new Set(assignments.map((a) => a.branchId).filter(Boolean))] as string[];
    const aud = { in: [AnnouncementAudience.ALL, AnnouncementAudience.TEACHERS, AnnouncementAudience.BOTH] };
    const parts: Prisma.AnnouncementWhereInput[] = [{ teacherScope: AnnouncementTeacherScope.INSTITUTION, audience: aud }];
    if (campusIds.length) parts.push({ teacherScope: AnnouncementTeacherScope.CAMPUS, teacherCampusId: { in: campusIds }, audience: aud });
    if (programIds.length) parts.push({ teacherScope: AnnouncementTeacherScope.DEPARTMENT, teacherProgramId: { in: programIds }, audience: aud });
    if (branchIds.length) parts.push({ teacherScope: AnnouncementTeacherScope.BRANCH, teacherBranchId: { in: branchIds }, audience: aud });
    return parts;
  }

  private announcementWhereForAssignments(assignments: Awaited<ReturnType<PortalsController["getActiveTeacher"]>>["assignments"]): Prisma.AnnouncementWhereInput[] {
    return [
      { campusId: null, programId: null, branchId: null, batchId: null, classId: null, sectionId: null },
      ...assignments.map((assignment) => ({
        campusId: assignment.campusId ?? undefined,
        programId: assignment.programId ?? undefined,
        branchId: assignment.branchId ?? undefined,
        batchId: assignment.batchId ?? undefined,
        classId: assignment.classId ?? undefined,
        sectionId: assignment.sectionId ?? undefined
      }))
    ];
  }

  private toTimetableObject(slot: Awaited<ReturnType<PrismaService["timetableSlot"]["findMany"]>>[number] & {
    campus: { code: string };
    branch: { code: string; name: string };
    class: { label: string; semesterNumber: number };
    section: { name: string };
    subject: { code: string; name: string } | null;
    teacherProfile: { user: { fullName: string } } | null;
  }) {
    return {
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      time: `${slot.startTime}-${slot.endTime}`,
      room: slot.room,
      teacher: slot.teacherProfile?.user.fullName ?? "Unassigned",
      structure: {
        campus: slot.campus.code,
        branch: slot.branch.name,
        semester: slot.class.semesterNumber,
        section: slot.section.name,
        subject: slot.subject ? `${slot.subject.code} - ${slot.subject.name}` : "General"
      }
    };
  }

  private todayDayOfWeek() {
    const day = istDayOfWeek();
    return day === 0 ? 7 : day;
  }
}

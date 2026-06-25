import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import {
  CreateFeedbackFormDto,
  FeedbackExportQueryDto,
  FeedbackFormQueryDto,
  ParagraphAnswersQueryDto,
  SubmitFeedbackDto,
  UpdateFeedbackFormDto
} from "./feedback.dto";
import { FeedbackService } from "./feedback.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get("forms/active")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS, { skipRequestScope: true })
  listActive(@CurrentUser() user: AuthUser, @Query() query: FeedbackFormQueryDto) {
    return this.feedback.listActiveAdmin(user, query);
  }

  @Get("forms/archived")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS, { skipRequestScope: true })
  listArchived(@CurrentUser() user: AuthUser, @Query() query: FeedbackFormQueryDto) {
    return this.feedback.listArchivedAdmin(user, query);
  }

  @Get("forms")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS, { skipRequestScope: true })
  list(@CurrentUser() user: AuthUser, @Query() query: FeedbackFormQueryDto) {
    return this.feedback.listAdmin(user, query);
  }

  @Get("student/available")
  @RequiresPermission(PermissionAction.SUBMIT_FEEDBACK)
  studentAvailable(@CurrentUser() user: AuthUser, @Query() query: FeedbackFormQueryDto) {
    return this.feedback.listAvailableForStudent(user, query);
  }

  @Get("forms/:id/completion")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS, { skipRequestScope: true })
  completion(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.formCompletion(user, id);
  }

  @Post("forms/:id/remind")
  @RequiresPermission(PermissionAction.MANAGE_FEEDBACK)
  remind(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.sendReminders(user, id);
  }

  @Get("forms/:id/export")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS)
  export(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query() query: FeedbackExportQueryDto) {
    return this.feedback.exportCsv(user, id, query);
  }

  @Get("forms/:id/report/summary")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS)
  report(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.reportSummary(user, id);
  }

  @Get("forms/:id/questions/:questionId/paragraphs")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS)
  paragraphs(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Query() query: ParagraphAnswersQueryDto
  ) {
    return this.feedback.paragraphAnswers(user, id, questionId, query);
  }

  @Get("forms/:id")
  @RequiresPermission(PermissionAction.VIEW_FEEDBACK_ANALYTICS, { skipRequestScope: true })
  getOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.getOne(user, id);
  }

  @Post("forms")
  @RequiresPermission(PermissionAction.MANAGE_FEEDBACK)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackFormDto) {
    return this.feedback.create(user, dto);
  }

  @Patch("forms/:id")
  @RequiresPermission(PermissionAction.MANAGE_FEEDBACK)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateFeedbackFormDto) {
    return this.feedback.update(user, id, dto);
  }

  @Post("forms/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_FEEDBACK)
  archive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.archive(user, id);
  }

  @Delete("forms/:id")
  @RequiresPermission(PermissionAction.MANAGE_FEEDBACK)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.feedback.remove(user, id);
  }

  @Post("student/forms/:id/submit")
  @RequiresPermission(PermissionAction.SUBMIT_FEEDBACK)
  submit(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SubmitFeedbackDto) {
    return this.feedback.submit(user, id, dto);
  }
}

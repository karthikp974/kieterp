import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import {
  AttendanceExportQueryDto,
  AttendanceQueryDto,
  AttendanceScopeDto,
  BulkMarkAttendanceDto,
  CorrectionRequestQueryDto,
  CreateAttendanceHolidayDto,
  CreateCorrectionRequestDto,
  MarkAttendanceDto
} from "./attendance.dto";
import { AttendanceService } from "./attendance.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  list(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    return this.attendance.list(user, query);
  }

  @Get("me")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  mySummary(@CurrentUser() user: AuthUser) {
    return this.attendance.mySummary(user);
  }

  @Post("roster")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  roster(@CurrentUser() user: AuthUser, @Body() scope: AttendanceScopeDto) {
    return this.attendance.roster(user, scope);
  }

  @Post("mark")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.attendance.mark(user, dto);
  }

  @Post("bulk")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  bulkMark(@CurrentUser() user: AuthUser, @Body() dto: BulkMarkAttendanceDto) {
    return this.attendance.bulkMark(user, dto);
  }

  @Get("export")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  export(@CurrentUser() user: AuthUser, @Query() query: AttendanceExportQueryDto, @Res() response: Response) {
    return this.attendance.export(user, query, response);
  }

  @Get("correction-requests")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  correctionRequests(@CurrentUser() user: AuthUser, @Query() query: CorrectionRequestQueryDto) {
    return this.attendance.listCorrectionRequests(user, query);
  }

  @Post("correction-requests/:id/approve")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  approveCorrection(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.attendance.approveCorrectionRequest(user, id);
  }

  @Post("correction-requests/:id/reject")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  rejectCorrection(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.attendance.rejectCorrectionRequest(user, id);
  }

  @Get("holidays")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  holidays() {
    return this.attendance.listHolidays();
  }

  @Post("holidays")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  createHoliday(@CurrentUser() user: AuthUser, @Body() dto: CreateAttendanceHolidayDto) {
    return this.attendance.createHoliday(user, dto);
  }

  @Post(":id/correction-requests")
  @RequiresPermission(PermissionAction.MARK_ATTENDANCE)
  createCorrection(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateCorrectionRequestDto) {
    return this.attendance.createCorrectionRequest(user, id, dto);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.VIEW_ATTENDANCE)
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.attendance.get(user, id);
  }
}

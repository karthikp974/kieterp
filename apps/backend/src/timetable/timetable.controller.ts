import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { CreateTimetableSlotDto, TimetableExportQueryDto, TimetableQueryDto, UpdateTimetableSlotDto } from "./timetable.dto";
import { TimetableService } from "./timetable.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("timetable")
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get()
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  list(@CurrentUser() user: AuthUser, @Query() query: TimetableQueryDto) {
    return this.timetable.list(user, query);
  }

  @Get("me")
  @RequiresPermission(PermissionAction.VIEW_STUDENT_PORTAL)
  myTimetable(@CurrentUser() user: AuthUser) {
    return this.timetable.myTimetable(user);
  }

  @Get("teacher/me")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  myTeacherTimetable(@CurrentUser() user: AuthUser) {
    return this.timetable.myTimetable(user);
  }

  @Get("export")
  @RequiresPermission(PermissionAction.VIEW_TEACHER_PORTAL)
  export(@CurrentUser() user: AuthUser, @Query() query: TimetableExportQueryDto, @Res() response: Response) {
    return this.timetable.export(user, query, response);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_TIMETABLE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTimetableSlotDto) {
    return this.timetable.create(user, dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_TIMETABLE)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTimetableSlotDto) {
    return this.timetable.update(user, id, dto);
  }

  @Post(":id/archive")
  @RequiresPermission(PermissionAction.MANAGE_TIMETABLE)
  archive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.timetable.archive(user, id);
  }
}

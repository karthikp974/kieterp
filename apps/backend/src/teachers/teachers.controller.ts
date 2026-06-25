import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import {
  BulkCreateTeachersDto,
  CreateTeacherDto,
  ResetTeacherPasswordDto,
  TeacherListQueryDto,
  UpdateTeacherAssignmentsDto,
  UpdateTeacherDto
} from "./teachers.dto";
import { TeachersService } from "./teachers.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  list(@CurrentUser() user: AuthUser, @Query() query: TeacherListQueryDto) {
    return this.teachers.list(query, user);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  search(@CurrentUser() user: AuthUser, @Query() query: TeacherListQueryDto) {
    return this.teachers.search(query, user);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teachers.get(id, user);
  }

  @Post("validate")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  validate(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherDto) {
    return this.teachers.validate(dto, user);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto, user);
  }

  @Post("bulk")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  bulkCreate(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateTeachersDto) {
    return this.teachers.bulkCreate(dto, user);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto, user);
  }

  @Patch(":id/assignments")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  updateAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTeacherAssignmentsDto) {
    return this.teachers.updateAssignments(id, dto, user);
  }

  @Post(":id/deactivate")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  deactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teachers.deactivate(id, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  archive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teachers.archive(id, user);
  }

  @Post(":id/reactivate")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  reactivate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.teachers.reactivate(id, user);
  }

  @Post(":id/reset-password")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  resetPassword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ResetTeacherPasswordDto) {
    return this.teachers.resetPassword(id, dto, user);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth.types";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { BulkCreateStudentsDto, CreateStudentDto, ResetStudentPasswordDto, StudentListQueryDto, UpdateStudentDto } from "./students.dto";
import { StudentsService } from "./students.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  list(@Query() query: StudentListQueryDto, @CurrentUser() user: AuthUser) {
    return this.students.list(query, user);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  search(@Query() query: StudentListQueryDto, @CurrentUser() user: AuthUser) {
    return this.students.search(query, user);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.students.get(id, user);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.students.create(dto, user);
  }

  @Post("bulk")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  bulkCreate(@Body() dto: BulkCreateStudentsDto, @CurrentUser() user: AuthUser) {
    return this.students.queueBulkImport(dto, user);
  }

  @Get("imports/:jobId")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  importJob(@Param("jobId") jobId: string, @CurrentUser() user: AuthUser) {
    return this.students.getImportJob(jobId, user);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  update(@Param("id") id: string, @Body() dto: UpdateStudentDto, @CurrentUser() user: AuthUser) {
    return this.students.update(id, dto, user);
  }

  @Post(":id/deactivate")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  deactivate(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.students.deactivate(id, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.students.archive(id, user);
  }

  @Post(":id/reactivate")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  reactivate(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.students.reactivate(id, user);
  }

  @Post(":id/reset-password")
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  resetPassword(@Param("id") id: string, @Body() dto: ResetStudentPasswordDto, @CurrentUser() user: AuthUser) {
    return this.students.resetPassword(id, dto, user);
  }
}

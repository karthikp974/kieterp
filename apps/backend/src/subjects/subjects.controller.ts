import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { CreateSubjectModuleDto, SubjectSearchQueryDto, UpdateSubjectModuleDto } from "./subjects.dto";
import { SubjectsService } from "./subjects.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("subjects")
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: SubjectSearchQueryDto) {
    return this.service.search(query);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  search(@Query() query: SubjectSearchQueryDto) {
    return this.service.search(query);
  }

  @Get("filter")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  filter(@Query() query: SubjectSearchQueryDto) {
    return this.service.search(query);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateSubjectModuleDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateSubjectModuleDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { ClassSearchQueryDto, CreateClassDto, CreateSectionsDto, ExportQueryDto, SectionSearchQueryDto, UpdateClassDto, UpdateSectionDto } from "./classes-sections.dto";
import { ClassesSectionsService } from "./classes-sections.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("classes")
export class ClassesController {
  constructor(private readonly service: ClassesSectionsService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: ClassSearchQueryDto) {
    return this.service.listClasses(query);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  search(@Query() query: ClassSearchQueryDto) {
    return this.service.searchClasses(query);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  details(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.classDetails(id, user);
  }

  @Get(":id/export")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  export(@Param("id") id: string, @Query() query: ExportQueryDto, @Res() response: Response, @CurrentUser() user: AuthUser) {
    return this.service.exportClass(id, query, response, user);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateClassDto) {
    return this.service.createClass(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateClassDto, @CurrentUser() user: AuthUser) {
    return this.service.updateClass(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archiveClass(id, user);
  }
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("sections")
export class SectionsController {
  constructor(private readonly service: ClassesSectionsService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: SectionSearchQueryDto) {
    return this.service.listSections(query);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  search(@Query() query: SectionSearchQueryDto) {
    return this.service.searchSections(query);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateSectionsDto) {
    return this.service.createSections(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateSectionDto, @CurrentUser() user: AuthUser) {
    return this.service.updateSection(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archiveSection(id, user);
  }
}

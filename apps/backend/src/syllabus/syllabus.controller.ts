import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { CreateSyllabusDto, SyllabusSearchQueryDto, UpdateSyllabusDto } from "./syllabus.dto";
import { SyllabusService } from "./syllabus.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("syllabus")
export class SyllabusController {
  constructor(private readonly service: SyllabusService) {}

  @Get("subjects/search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  searchSubjects(@Query() query: SyllabusSearchQueryDto) {
    return this.service.searchSubjects(query);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  search(@Query() query: SyllabusSearchQueryDto) {
    return this.service.search(query);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateSyllabusDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateSyllabusDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user);
  }
}

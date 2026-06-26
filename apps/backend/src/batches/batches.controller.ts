import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { BatchExportQueryDto, BatchSearchQueryDto, CreateBatchModuleDto, UpdateBatchModuleDto } from "./batches.dto";
import { BatchesService } from "./batches.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("batches")
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: BatchSearchQueryDto) {
    return this.service.search(query);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  search(@Query() query: BatchSearchQueryDto) {
    return this.service.search(query);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  details(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.details(id, user);
  }

  @Get(":id/export")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  export(@Param("id") id: string, @Query() query: BatchExportQueryDto, @Res() response: Response, @CurrentUser() user: AuthUser) {
    return this.service.export(id, query, response, user);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateBatchModuleDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateBatchModuleDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, user);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { BranchQueryDto, CreateBranchesDto, CreateDepartmentDto, DepartmentQueryDto, UpdateBranchDto, UpdateDepartmentDto } from "./department-branch.dto";
import { DepartmentBranchService } from "./department-branch.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
export class DepartmentBranchBaseController {
  constructor(protected readonly service: DepartmentBranchService) {}
}

@Controller("department-branch")
export class DepartmentBranchController extends DepartmentBranchBaseController {
  @Get("campuses")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  campuses(@Query() query: PaginationQueryDto) {
    return this.service.campuses(query);
  }
}

@Controller("departments")
export class DepartmentsController extends DepartmentBranchBaseController {
  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: DepartmentQueryDto) {
    return this.service.listDepartments(query);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.createDepartment(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: AuthUser) {
    return this.service.updateDepartment(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archiveDepartment(id, user);
  }
}

@Controller("branches")
export class BranchesController extends DepartmentBranchBaseController {
  @Get()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  list(@Query() query: BranchQueryDto) {
    return this.service.listBranches(query);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  create(@Body() dto: CreateBranchesDto) {
    return this.service.createBranches(dto);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@Param("id") id: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthUser) {
    return this.service.updateBranch(id, dto, user);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.archiveBranch(id, user);
  }
}

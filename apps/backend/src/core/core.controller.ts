import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { CoreService } from "./core.service";
import {
  CreateBatchDto,
  CreateBranchDto,
  CreateCampusDto,
  CreateClassDto,
  CreateProgramDto,
  CreateSectionDto,
  CreateSubjectDto,
  GenerateBatchClassesDto,
  ScopedStructureQueryDto,
  UpdateBatchDto,
  UpdateBranchDto,
  UpdateCampusDto,
  UpdateClassDto,
  UpdateProgramDto,
  UpdateSectionDto,
  UpdateSubjectDto
} from "./structure.dto";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("core")
export class CoreController {
  constructor(private readonly core: CoreService) {}

  @Get("summary")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  summary() {
    return this.core.getFoundationSummary();
  }

  @Get("campuses")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  campuses(@Query() query: PaginationQueryDto, @Req() request: { user: AuthUser }) {
    return this.core.listCampuses(query, request.user);
  }

  @Get("campus-groups")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  campusGroups() {
    return this.core.listCampusGroups();
  }

  @Post("campuses")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createCampus(@Body() dto: CreateCampusDto) {
    return this.core.createCampus(dto);
  }

  @Patch("campuses/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateCampus(@Param("id") id: string, @Body() dto: UpdateCampusDto, @CurrentUser() user: AuthUser) {
    return this.core.updateCampus(id, dto, user);
  }

  @Post("campuses/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveCampus(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveCampus(id, user);
  }

  @Get("programs")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  programs(@Query() query: ScopedStructureQueryDto) {
    return this.core.listPrograms(query);
  }

  @Post("programs")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createProgram(@Body() dto: CreateProgramDto) {
    return this.core.createProgram(dto);
  }

  @Patch("programs/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateProgram(@Param("id") id: string, @Body() dto: UpdateProgramDto, @CurrentUser() user: AuthUser) {
    return this.core.updateProgram(id, dto, user);
  }

  @Post("programs/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveProgram(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveProgram(id, user);
  }

  @Get("branches")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  branches(@Query() query: ScopedStructureQueryDto) {
    return this.core.listBranches(query);
  }

  @Post("branches")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createBranch(@Body() dto: CreateBranchDto) {
    return this.core.createBranch(dto);
  }

  @Patch("branches/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateBranch(@Param("id") id: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthUser) {
    return this.core.updateBranch(id, dto, user);
  }

  @Post("branches/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveBranch(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveBranch(id, user);
  }

  @Get("batches")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  batches(@Query() query: ScopedStructureQueryDto) {
    return this.core.listBatches(query);
  }

  @Post("batches")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createBatch(@Body() dto: CreateBatchDto) {
    return this.core.createBatch(dto);
  }

  @Patch("batches/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateBatch(@Param("id") id: string, @Body() dto: UpdateBatchDto, @CurrentUser() user: AuthUser) {
    return this.core.updateBatch(id, dto, user);
  }

  @Post("batches/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveBatch(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveBatch(id, user);
  }

  @Post("batches/:id/generate-classes")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  generateBatchClasses(@Param("id") id: string, @Body() dto: GenerateBatchClassesDto, @CurrentUser() user: AuthUser) {
    return this.core.generateBatchClasses(id, dto, user);
  }

  @Get("classes")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  classes(@Query() query: ScopedStructureQueryDto) {
    return this.core.listClasses(query);
  }

  @Post("classes")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createClass(@Body() dto: CreateClassDto) {
    return this.core.createClass(dto);
  }

  @Patch("classes/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateClass(@Param("id") id: string, @Body() dto: UpdateClassDto, @CurrentUser() user: AuthUser) {
    return this.core.updateClass(id, dto, user);
  }

  @Post("classes/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveClass(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveClass(id, user);
  }

  @Get("sections")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  sections(@Query() query: ScopedStructureQueryDto) {
    return this.core.listSections(query);
  }

  @Get("sections/:id/ecosystem")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  sectionEcosystem(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.getSectionEcosystem(id, user);
  }

  @Get("subjects")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  subjects(@Query() query: ScopedStructureQueryDto) {
    return this.core.listSubjects(query);
  }

  @Post("subjects")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.core.createSubject(dto);
  }

  @Patch("subjects/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateSubject(@Param("id") id: string, @Body() dto: UpdateSubjectDto, @CurrentUser() user: AuthUser) {
    return this.core.updateSubject(id, dto, user);
  }

  @Post("subjects/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveSubject(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveSubject(id, user);
  }

  @Post("sections")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createSection(@Body() dto: CreateSectionDto) {
    return this.core.createSection(dto);
  }

  @Patch("sections/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateSection(@Param("id") id: string, @Body() dto: UpdateSectionDto, @CurrentUser() user: AuthUser) {
    return this.core.updateSection(id, dto, user);
  }

  @Post("sections/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveSection(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.core.archiveSection(id, user);
  }
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("campuses")
export class CampusesController {
  constructor(private readonly core: CoreService) {}

  @Get()
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  list(@Query() query: PaginationQueryDto, @Req() request: { user: AuthUser }) {
    return this.core.listCampuses(query, request.user);
  }

  @Get("search")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  search(@Query() query: PaginationQueryDto, @Req() request: { user: AuthUser }) {
    return this.core.listCampuses(query, request.user);
  }

  @Get(":id")
  @RequiresPermission(PermissionAction.VIEW_ADMIN_PORTAL)
  get(@Param("id") id: string, @Req() request: { user: AuthUser }) {
    return this.core.getCampus(id, request.user);
  }
}

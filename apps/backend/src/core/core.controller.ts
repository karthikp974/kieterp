import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
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
  updateCampus(@Param("id") id: string, @Body() dto: UpdateCampusDto) {
    return this.core.updateCampus(id, dto);
  }

  @Post("campuses/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveCampus(@Param("id") id: string) {
    return this.core.archiveCampus(id);
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
  updateProgram(@Param("id") id: string, @Body() dto: UpdateProgramDto) {
    return this.core.updateProgram(id, dto);
  }

  @Post("programs/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveProgram(@Param("id") id: string) {
    return this.core.archiveProgram(id);
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
  updateBranch(@Param("id") id: string, @Body() dto: UpdateBranchDto) {
    return this.core.updateBranch(id, dto);
  }

  @Post("branches/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveBranch(@Param("id") id: string) {
    return this.core.archiveBranch(id);
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
  updateBatch(@Param("id") id: string, @Body() dto: UpdateBatchDto) {
    return this.core.updateBatch(id, dto);
  }

  @Post("batches/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveBatch(@Param("id") id: string) {
    return this.core.archiveBatch(id);
  }

  @Post("batches/:id/generate-classes")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  generateBatchClasses(@Param("id") id: string, @Body() dto: GenerateBatchClassesDto) {
    return this.core.generateBatchClasses(id, dto);
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
  updateClass(@Param("id") id: string, @Body() dto: UpdateClassDto) {
    return this.core.updateClass(id, dto);
  }

  @Post("classes/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveClass(@Param("id") id: string) {
    return this.core.archiveClass(id);
  }

  @Get("sections")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  sections(@Query() query: ScopedStructureQueryDto) {
    return this.core.listSections(query);
  }

  @Get("sections/:id/ecosystem")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  sectionEcosystem(@Param("id") id: string) {
    return this.core.getSectionEcosystem(id);
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
  updateSubject(@Param("id") id: string, @Body() dto: UpdateSubjectDto) {
    return this.core.updateSubject(id, dto);
  }

  @Post("subjects/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveSubject(@Param("id") id: string) {
    return this.core.archiveSubject(id);
  }

  @Post("sections")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createSection(@Body() dto: CreateSectionDto) {
    return this.core.createSection(dto);
  }

  @Patch("sections/:id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  updateSection(@Param("id") id: string, @Body() dto: UpdateSectionDto) {
    return this.core.updateSection(id, dto);
  }

  @Post("sections/:id/archive")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archiveSection(@Param("id") id: string) {
    return this.core.archiveSection(id);
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

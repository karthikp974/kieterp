import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { PromoteSelectedStudentsDto, PromoteStudentsDto, PromotionClassQueryDto, PromotionHistoryQueryDto, PromotionSectionQueryDto, PromotionSemesterPairsQueryDto, PromotionStudentsQueryDto } from "./promotions.dto";
import { PromotionsService } from "./promotions.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("promotions")
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get("semester-pairs")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  semesterPairs(@CurrentUser() user: AuthUser, @Query() query: PromotionSemesterPairsQueryDto) {
    return this.promotions.semesterPairs(user, query.branchId);
  }

  @Get("classes")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  classes(@CurrentUser() user: AuthUser, @Query() query: PromotionClassQueryDto) {
    return this.promotions.classes(user, query);
  }

  @Get("sections")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  sections(@CurrentUser() user: AuthUser, @Query() query: PromotionSectionQueryDto) {
    return this.promotions.sections(user, query);
  }

  @Get("students")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  students(@CurrentUser() user: AuthUser, @Query() query: PromotionStudentsQueryDto) {
    return this.promotions.students(user, query);
  }

  @Get("preview")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  preview(@CurrentUser() user: AuthUser, @Query("fromSectionId") fromSectionId: string, @Query("toSectionId") toSectionId: string) {
    return this.promotions.preview(user, fromSectionId, toSectionId);
  }

  @Post()
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  promote(@CurrentUser() user: AuthUser, @Body() dto: PromoteStudentsDto) {
    return this.promotions.promote(user, dto);
  }

  @Post("promote")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  promoteSelected(@CurrentUser() user: AuthUser, @Body() dto: PromoteSelectedStudentsDto) {
    return this.promotions.promoteSelected(user, dto);
  }

  @Get("history")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  history(@CurrentUser() user: AuthUser, @Query() query: PromotionHistoryQueryDto) {
    return this.promotions.history(user, query);
  }
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("promotion")
export class PromotionAliasController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get("semester-pairs")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  semesterPairs(@CurrentUser() user: AuthUser, @Query() query: PromotionSemesterPairsQueryDto) {
    return this.promotions.semesterPairs(user, query.branchId);
  }

  @Get("classes")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  classes(@CurrentUser() user: AuthUser, @Query() query: PromotionClassQueryDto) {
    return this.promotions.classes(user, query);
  }

  @Get("sections")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  sections(@CurrentUser() user: AuthUser, @Query() query: PromotionSectionQueryDto) {
    return this.promotions.sections(user, query);
  }

  @Get("students")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  students(@CurrentUser() user: AuthUser, @Query() query: PromotionStudentsQueryDto) {
    return this.promotions.students(user, query);
  }

  @Post("promote")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  promoteSelected(@CurrentUser() user: AuthUser, @Body() dto: PromoteSelectedStudentsDto) {
    return this.promotions.promoteSelected(user, dto);
  }

  @Get("history")
  @RequiresPermission(PermissionAction.MANAGE_PROMOTIONS)
  history(@CurrentUser() user: AuthUser, @Query() query: PromotionHistoryQueryDto) {
    return this.promotions.history(user, query);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { AssignFeeDto, CreateFeeHeadDto, CreateFeeStructureDto, FeeExportQueryDto, FeeQueryDto, FeeStudentSearchQueryDto, MarkFeePaymentDto, ReverseFeePaymentDto, UpdateAssignedFeeDto } from "./finance.dto";
import { FinanceService } from "./finance.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("heads")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  heads() {
    return this.finance.listHeads();
  }

  @Post("heads")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createHead(@CurrentUser() user: AuthUser, @Body() dto: CreateFeeHeadDto) {
    return this.finance.createHead(user, dto);
  }

  @Get("structures")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  structures(@CurrentUser() user: AuthUser, @Query() query: FeeQueryDto) {
    return this.finance.listStructures(query, user);
  }

  @Post("structures")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  createStructure(@CurrentUser() user: AuthUser, @Body() dto: CreateFeeStructureDto) {
    return this.finance.createStructure(user, dto);
  }

  @Post("structures/:id/deactivate")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  deactivateStructure(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.deactivateStructure(user, id);
  }

  @Get("payments")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  payments(@CurrentUser() user: AuthUser, @Query() query: FeeQueryDto) {
    return this.finance.listPayments(user, query);
  }

  @Post("payments")
  @RequiresPermission(PermissionAction.MARK_FEES)
  markPayment(@CurrentUser() user: AuthUser, @Body() dto: MarkFeePaymentDto) {
    return this.finance.markPayment(user, dto);
  }

  @Post("payments/:id/reverse")
  @RequiresPermission(PermissionAction.MARK_FEES)
  reversePayment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReverseFeePaymentDto) {
    return this.finance.reversePayment(user, id, dto);
  }

  @Get("me")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  myFinance(@CurrentUser() user: AuthUser) {
    return this.finance.myFinance(user);
  }

  @Get("students/:id/assigned-fees")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  studentAssignedFees(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.studentAssignedFees(user, id);
  }

  @Get("students/:id")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  studentFinance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.studentFinance(user, id);
  }

  @Get("export")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  export(@CurrentUser() user: AuthUser, @Query() query: FeeExportQueryDto, @Res() response: Response) {
    return this.finance.export(user, query, response);
  }
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("fees")
export class FeesController {
  constructor(private readonly finance: FinanceService) {}

  @Get("students/search")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  searchStudents(@CurrentUser() user: AuthUser, @Query() query: FeeStudentSearchQueryDto) {
    return this.finance.searchFeeStudents(query, user);
  }

  @Post("assign")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  assign(@CurrentUser() user: AuthUser, @Body() dto: AssignFeeDto) {
    return this.finance.assignFee(user, dto);
  }

  @Get("structures")
  @RequiresPermission(PermissionAction.VIEW_FEES)
  structures(@CurrentUser() user: AuthUser, @Query() query: FeeQueryDto) {
    return this.finance.listAssignedStructures(query, user);
  }

  @Patch(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateAssignedFeeDto) {
    return this.finance.updateAssignedFee(user, id, dto);
  }

  @Delete(":id")
  @RequiresPermission(PermissionAction.MANAGE_STRUCTURE)
  archive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.archiveAssignedFee(user, id);
  }
}

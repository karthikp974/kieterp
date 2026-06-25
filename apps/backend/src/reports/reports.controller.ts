import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import {
  PortalReportsDashboardQueryDto,
  PortalReportsExportQueryDto
} from "./portal-reports.dto";
import { PortalReportsService } from "./portal-reports.service";
import { ReportsExportQueryDto, ReportsQueryDto } from "./reports.dto";
import { ReportsService } from "./reports.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly portalReports: PortalReportsService
  ) {}

  @Get("summary")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  summary(@CurrentUser() user: AuthUser, @Query() query: ReportsQueryDto) {
    return this.reports.summary(user, query);
  }

  @Get("attendance")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  attendance(@CurrentUser() user: AuthUser, @Query() query: ReportsQueryDto) {
    return this.reports.attendance(user, query);
  }

  @Get("finance")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  finance(@CurrentUser() user: AuthUser, @Query() query: ReportsQueryDto) {
    return this.reports.finance(user, query);
  }

  @Get("results")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  results(@CurrentUser() user: AuthUser, @Query() query: ReportsQueryDto) {
    return this.reports.results(user, query);
  }

  @Get("applications")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  applications(@CurrentUser() user: AuthUser, @Query() query: ReportsQueryDto) {
    return this.reports.applications(user, query);
  }

  @Get("summary/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  exportSummary(@CurrentUser() user: AuthUser, @Query() query: ReportsExportQueryDto, @Res() response: Response) {
    return this.reports.exportSummary(user, query, response);
  }

  @Get("attendance/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  exportAttendance(@CurrentUser() user: AuthUser, @Query() query: ReportsExportQueryDto, @Res() response: Response) {
    return this.reports.exportAttendance(user, query, response);
  }

  @Get("finance/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  exportFinance(@CurrentUser() user: AuthUser, @Query() query: ReportsExportQueryDto, @Res() response: Response) {
    return this.reports.exportFinance(user, query, response);
  }

  @Get("results/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  exportResults(@CurrentUser() user: AuthUser, @Query() query: ReportsExportQueryDto, @Res() response: Response) {
    return this.reports.exportResults(user, query, response);
  }

  @Get("portal/setup")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  portalSetup(@CurrentUser() user: AuthUser) {
    return this.portalReports.getSetup(user);
  }

  @Get("portal/dashboard")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  portalDashboard(@CurrentUser() user: AuthUser, @Query() query: PortalReportsDashboardQueryDto) {
    return this.portalReports.getDashboard(user, query);
  }

  @Get("portal/export")
  @RequiresPermission(PermissionAction.VIEW_REPORTS)
  portalExport(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalReportsExportQueryDto,
    @Res() response: Response
  ) {
    return this.portalReports.exportReport(user, query, response);
  }
}

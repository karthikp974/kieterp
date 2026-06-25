import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { DatabaseRowsQueryDto } from "./database-browser.dto";
import { DatabaseBrowserService } from "./database-browser.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("database")
export class DatabaseBrowserController {
  constructor(private readonly databaseBrowser: DatabaseBrowserService) {}

  @Get("tables")
  @RequiresPermission(PermissionAction.VIEW_DB_PORTAL)
  tables() {
    return this.databaseBrowser.tables();
  }

  @Get("tables/:tableKey/rows")
  @RequiresPermission(PermissionAction.VIEW_DB_PORTAL)
  rows(@Param("tableKey") tableKey: string, @Query() query: DatabaseRowsQueryDto, @CurrentUser() user: AuthUser) {
    return this.databaseBrowser.rows(tableKey, query, user);
  }
}

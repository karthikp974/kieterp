import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { AuditLogQueryDto } from "./audit.dto";
import { AuditService } from "./audit.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequiresPermission(PermissionAction.MANAGE_USERS)
  list(@CurrentUser() user: AuthUser, @Query() query: AuditLogQueryDto) {
    return this.audit.list(query, user);
  }
}

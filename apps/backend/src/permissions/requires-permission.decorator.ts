import { SetMetadata } from "@nestjs/common";
import { PermissionAction } from "@prisma/client";

export const REQUIRED_PERMISSION_KEY = "requiredPermission";

export type RequiredPermissionMetadata = {
  action: PermissionAction;
  /** When true, role permission is checked without request scope (service validates scope). */
  skipRequestScope?: boolean;
};

export const RequiresPermission = (action: PermissionAction, options?: { skipRequestScope?: boolean }) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, {
    action,
    skipRequestScope: options?.skipRequestScope
  } satisfies RequiredPermissionMetadata);

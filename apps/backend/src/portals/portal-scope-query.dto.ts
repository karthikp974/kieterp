import { IsOptional, IsString } from "class-validator";

/** PermissionGuard may inject these on `request.query` — whitelist them on portal query DTOs. */
export class PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  campusGroupId?: string;
}

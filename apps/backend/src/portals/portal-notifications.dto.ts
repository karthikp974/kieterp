import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export const PORTAL_NOTIFICATION_KINDS = ["ANNOUNCEMENT", "FEEDBACK", "SYSTEM"] as const;
export type PortalNotificationKind = (typeof PORTAL_NOTIFICATION_KINDS)[number];

export class PortalNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsIn(PORTAL_NOTIFICATION_KINDS)
  kind?: PortalNotificationKind;
}

/** @deprecated Use PortalNotificationsQueryDto */
export class StudentNotificationsQueryDto extends PortalNotificationsQueryDto {}

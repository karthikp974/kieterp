import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "../common/pagination.dto";

export class TrackActivityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  portal?: string;

  @IsOptional()
  @IsIn(["PAGE_VIEW", "HEARTBEAT"])
  kind?: "PAGE_VIEW" | "HEARTBEAT";
}

export class OpsSessionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["live", "today", "past"])
  scope?: "live" | "today" | "past";

  /** IST calendar date (YYYY-MM-DD) — narrows list to that day. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  /** Hour bucket 0–23 within `date` (IST). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;
}

export class OpsBreakdownQueryDto {
  @IsIn(["live", "today", "past"])
  metric!: "live" | "today" | "past";
}
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export const HTPO_ATTENDANCE_PERIOD_PRESETS = [
  "custom",
  "this_month",
  "last_2_months",
  "this_semester",
  "last_semester"
] as const;

export type HtpoAttendancePeriodPreset = (typeof HTPO_ATTENDANCE_PERIOD_PRESETS)[number];

export class HtpoSectionAttendanceQueryDto {
  @IsOptional()
  @IsIn(HTPO_ATTENDANCE_PERIOD_PRESETS)
  period?: HtpoAttendancePeriodPreset = "this_semester";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dateFrom must be YYYY-MM-DD." })
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dateTo must be YYYY-MM-DD." })
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

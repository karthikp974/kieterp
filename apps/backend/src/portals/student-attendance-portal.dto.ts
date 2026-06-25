import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export class StudentAttendancePageQueryDto extends PaginationQueryDto {}

export type StudentAttendanceExportRange = "month" | "semester" | "overall";
export type StudentAttendanceExportFormat = "pdf" | "xlsx";
export type StudentAttendanceMonthPeriod = "last_1_month" | "last_3_months" | "last_6_months" | "custom";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class StudentAttendanceExportQueryDto {
  @IsIn(["month", "semester", "overall"])
  range!: StudentAttendanceExportRange;

  @IsIn(["pdf", "xlsx"])
  format!: StudentAttendanceExportFormat;

  @IsOptional()
  @IsIn(["last_1_month", "last_3_months", "last_6_months", "custom"])
  monthPeriod?: StudentAttendanceMonthPeriod;

  @IsOptional()
  @Matches(ISO_DATE)
  dateFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16)
  /** Linear semester index to export (1 → 1.1). Defaults to the student's current semester. */
  semesterNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  /** Max rows in export table (newest first). */
  rowLimit?: number;
}

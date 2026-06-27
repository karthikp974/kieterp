import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "../common/tabular-export.util";
import { PortalImplicitScopeQueryDto } from "./portal-scope-query.dto";

export const FEE_UI_STATUSES = ["all", "paid", "partial", "pending", "overdue"] as const;
export type FeeUiStatusFilter = (typeof FEE_UI_STATUSES)[number];

const FINANCE_EXPORT_FORMATS = [...TABULAR_EXPORT_FORMATS, "txt"] as const;

export class TeacherFinanceScopeQueryDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sectionId?: string;
}

export class TeacherFinanceStudentsQueryDto extends TeacherFinanceScopeQueryDto {
  @IsOptional()
  @IsIn(FEE_UI_STATUSES)
  status: FeeUiStatusFilter = "all";

  /** Search by roll number or name — applied within the teacher's scoped students only. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 8;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

export class TeacherFinanceRecentPaymentsQueryDto extends TeacherFinanceScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 15;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

export class TeacherFinancePendingStudentsQueryDto extends TeacherFinanceScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 15;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

export class TeacherFinanceExportQueryDto extends TeacherFinanceStudentsQueryDto {
  /** Browser iframe download passes JWT here; auth is handled by JwtStrategy. */
  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsIn(FINANCE_EXPORT_FORMATS)
  format!: TabularExportFormat | "txt";
}

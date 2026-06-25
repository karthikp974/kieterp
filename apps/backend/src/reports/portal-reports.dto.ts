import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "../common/tabular-export.util";
import { PaginationQueryDto } from "../common/pagination.dto";
import { PortalImplicitScopeQueryDto } from "../portals/portal-scope-query.dto";
import { PORTAL_REPORT_EXPORT_KINDS, type PortalReportExportKind } from "./portal-reports.util";

export class PortalReportsScopeQueryDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sectionId?: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  classId?: string;
}

export class PortalReportsDashboardQueryDto extends PortalReportsScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  performersPageSize = 5;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  attentionPageSize = 5;
}

export class PortalReportsExportQueryDto extends PortalReportsScopeQueryDto {
  @IsIn([...PORTAL_REPORT_EXPORT_KINDS])
  kind!: PortalReportExportKind;

  @IsIn([...TABULAR_EXPORT_FORMATS])
  format!: TabularExportFormat;

  /** Browser iframe download passes JWT here; auth is handled by JwtStrategy. */
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class PortalReportsSectionPerformanceQueryDto extends PortalReportsScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

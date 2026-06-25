import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "../common/tabular-export.util";

export class ReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

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

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReportsExportQueryDto extends ReportsQueryDto {
  @IsIn([...TABULAR_EXPORT_FORMATS])
  format!: TabularExportFormat;
}

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export class CreateBatchModuleDto {
  @IsString()
  departmentId!: string;

  @IsString()
  branchId!: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  startYear!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  batchCode!: string;
}

export class UpdateBatchModuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  batchCode!: string;
}

export class BatchSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class BatchExportQueryDto {
  @IsIn(["excel", "google-sheets", "csv", "pdf", "docx"])
  format!: "excel" | "google-sheets" | "csv" | "pdf" | "docx";
}

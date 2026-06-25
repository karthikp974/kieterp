import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { IntersectionType } from "@nestjs/mapped-types";
import { ResultEntryStatus } from "@prisma/client";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TabularExportFormatQueryDto } from "../common/export-query.dto";

export class UpsertResultEntryDto {
  @IsString()
  studentProfileId!: string;

  @IsString()
  subjectId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semesterNumber!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  examType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999.99)
  internals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999.99)
  externals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999.99)
  totalMarks?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  grade?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99.99)
  credits?: number;

  @IsEnum(ResultEntryStatus)
  status!: ResultEntryStatus;
}

export class ResultsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  campusGroupId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  studentProfileId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semesterNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  examType?: string;

  @IsOptional()
  @IsEnum(ResultEntryStatus)
  status?: ResultEntryStatus;
}

export class ResultsExportQueryDto extends IntersectionType(ResultsQueryDto, TabularExportFormatQueryDto) {}

export class ResultPdfImportDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  examType?: string;
}

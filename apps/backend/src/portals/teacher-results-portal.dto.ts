import { ResultEntryStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { PortalImplicitScopeQueryDto } from "./portal-scope-query.dto";

export class TeacherResultsSectionQueryDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  semesterNumber?: number;
}

export class TeacherResultsStudentSearchDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class TeacherResultSubjectRowDto {
  @IsString()
  @MaxLength(64)
  subjectCode!: string;

  @IsString()
  @MaxLength(200)
  subjectName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999.99)
  internals?: number;

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

  @IsOptional()
  @IsEnum(ResultEntryStatus)
  status?: ResultEntryStatus;
}

export class TeacherResultsBulkUpsertDto {
  @IsString()
  sectionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  semesterNumber!: number;

  @IsString()
  studentProfileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  examType?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TeacherResultSubjectRowDto)
  rows!: TeacherResultSubjectRowDto[];
}

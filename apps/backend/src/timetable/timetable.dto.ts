import { TimetableSlotType } from "@prisma/client";
import { IntersectionType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TabularExportFormatQueryDto } from "../common/export-query.dto";

export class CreateTimetableSlotDto {
  @IsString()
  campusId!: string;

  @IsString()
  programId!: string;

  @IsString()
  branchId!: string;

  @IsString()
  batchId!: string;

  @IsString()
  classId!: string;

  @IsString()
  sectionId!: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  teacherProfileId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @IsString()
  @MaxLength(10)
  startTime!: string;

  @IsString()
  @MaxLength(10)
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  room?: string;

  @IsOptional()
  @IsEnum(TimetableSlotType)
  slotType?: TimetableSlotType;
}

export class UpdateTimetableSlotDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  teacherProfileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  room?: string;

  @IsOptional()
  @IsEnum(TimetableSlotType)
  slotType?: TimetableSlotType;
}

export class TimetableQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  teacherProfileId?: string;
}

export class TimetableExportQueryDto extends IntersectionType(TimetableQueryDto, TabularExportFormatQueryDto) {}

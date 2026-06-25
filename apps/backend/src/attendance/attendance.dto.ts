import { AttendanceCorrectionStatus, AttendanceEntryStatus } from "@prisma/client";
import { IntersectionType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TabularExportFormatQueryDto } from "../common/export-query.dto";

export class AttendanceScopeDto {
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
}

export class AttendanceEntryDto {
  @IsString()
  studentProfileId!: string;

  @IsEnum(AttendanceEntryStatus)
  status!: AttendanceEntryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MarkAttendanceDto {
  @ValidateNested()
  @Type(() => AttendanceScopeDto)
  scope!: AttendanceScopeDto;

  @IsDateString()
  attendanceDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

export class BulkMarkAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  sessions!: MarkAttendanceDto[];
}

export class CreateCorrectionRequestDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

export class CorrectionRequestQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AttendanceCorrectionStatus)
  status?: AttendanceCorrectionStatus;
}

export class CreateAttendanceHolidayDto {
  @IsString()
  campusId!: string;

  @IsDateString()
  holidayDate!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;
}

export class AttendanceQueryDto extends PaginationQueryDto {
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
  subjectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AttendanceExportQueryDto extends IntersectionType(AttendanceQueryDto, TabularExportFormatQueryDto) {}

import { TimetableSlotType } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { TIME_24H_PATTERN } from "../timetable/timetable-grid.constants";

export class TeacherTimetableSlotEntryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(TIME_24H_PATTERN, { message: "startTime must be HH:mm (24-hour)." })
  @MaxLength(5)
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(TIME_24H_PATTERN, { message: "endTime must be HH:mm (24-hour)." })
  @MaxLength(5)
  endTime!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsEnum(TimetableSlotType)
  slotType!: TimetableSlotType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  room?: string;
}

export class TeacherAssignSubjectTeacherDto {
  @IsString()
  sectionId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherProfileId!: string;
}

export class TeacherTimetableAddSlotsDto {
  @IsOptional()
  @IsBoolean()
  allDays?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeacherTimetableSlotEntryDto)
  entries!: TeacherTimetableSlotEntryDto[];
}

export class TeacherTimetableArchivePeriodDto {
  @IsString()
  @Matches(TIME_24H_PATTERN, { message: "startTime must be HH:mm (24-hour)." })
  @MaxLength(5)
  startTime!: string;

  @IsString()
  @Matches(TIME_24H_PATTERN, { message: "endTime must be HH:mm (24-hour)." })
  @MaxLength(5)
  endTime!: string;
}

/** Filter params for assign form — not permission scope (avoid PermissionGuard collision). */
export class TeacherTimetableAssignOptionsQueryDto {
  @IsOptional()
  @IsString()
  pickSectionId?: string;

  @IsOptional()
  @IsString()
  pickSubjectId?: string;
}

export class TeacherUnassignSubjectTeacherDto {
  @IsString()
  sectionId!: string;

  @IsString()
  subjectId!: string;
}

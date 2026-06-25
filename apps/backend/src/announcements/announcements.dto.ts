import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import {
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTeacherRoleFilter,
  AnnouncementTeacherScope
} from "@prisma/client";
import { PaginationQueryDto } from "../common/pagination.dto";

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  body!: string;

  @IsEnum(AnnouncementAudience)
  audience!: AnnouncementAudience;

  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

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
  @IsEnum(AnnouncementTeacherScope)
  teacherScope?: AnnouncementTeacherScope;

  @IsOptional()
  @IsString()
  teacherCampusId?: string;

  @IsOptional()
  @IsString()
  teacherProgramId?: string;

  @IsOptional()
  @IsString()
  teacherBranchId?: string;

  @IsOptional()
  @IsEnum(AnnouncementTeacherRoleFilter)
  teacherRoleFilter?: AnnouncementTeacherRoleFilter;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  campusId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  programId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  batchId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  classId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  sectionId?: string | null;

  @IsOptional()
  @IsEnum(AnnouncementTeacherScope)
  teacherScope?: AnnouncementTeacherScope;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  teacherCampusId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  teacherProgramId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  teacherBranchId?: string | null;

  @IsOptional()
  @IsEnum(AnnouncementTeacherRoleFilter)
  teacherRoleFilter?: AnnouncementTeacherRoleFilter;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  expiresAt?: string | null;
}

export class AnnouncementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeReadStatus?: boolean;
}

import { TeacherRoleKind, UserStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export class TeacherIdentityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  employeeCode!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  designation?: string;

  @IsOptional()
  @IsDateString()
  joinedOn?: string;

  @IsString()
  @MinLength(2)
  password!: string;
}

export class TeacherAssignmentDto {
  @IsString()
  campusId!: string;

  @IsString()
  programId!: string;

  @IsString()
  branchId!: string;

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
  @IsString()
  subjectId?: string;

  @IsEnum(TeacherRoleKind)
  role!: TeacherRoleKind;
}

export class CreateTeacherDto {
  @ValidateNested()
  @Type(() => TeacherIdentityDto)
  identity!: TeacherIdentityDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeacherAssignmentDto)
  assignments!: TeacherAssignmentDto[];
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  designation?: string;

  @IsOptional()
  @IsDateString()
  joinedOn?: string;
}

export class UpdateTeacherAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TeacherAssignmentDto)
  assignments!: TeacherAssignmentDto[];
}

export class BulkCreateTeachersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateTeacherDto)
  teachers!: CreateTeacherDto[];
}

export class ResetTeacherPasswordDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

export class TeacherListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  role?: TeacherRoleKind;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

import { UserStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export class CreateStudentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  rollNumber!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fatherName!: string;

  @IsOptional() @IsString() @MaxLength(120) village?: string;
  @IsOptional() @IsString() @MaxLength(120) mandal?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(20) pincode?: string;
  @IsOptional() @IsString() @MaxLength(250) homeAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  // Optional at the DTO layer so teacher-scoped creates can default it from the
  // section's campus. StudentsService.create still rejects a missing campus.
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
  @IsInt()
  @Min(1)
  semester?: number;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsString()
  sectionId!: string;
}

export class UpdateStudentDto {
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
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  rollNumber?: string;

  @IsOptional() @IsString() @MaxLength(120) village?: string;
  @IsOptional() @IsString() @MaxLength(120) mandal?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(20) pincode?: string;
  @IsOptional() @IsString() @MaxLength(250) homeAddress?: string;

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
  @IsInt()
  @Min(1)
  semester?: number;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class BulkCreateStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students!: CreateStudentDto[];
}

export class ResetStudentPasswordDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

export class StudentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

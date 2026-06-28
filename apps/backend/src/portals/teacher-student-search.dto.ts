import { UserStatus } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

/** Search students within the teacher's sections by name or roll number. */
export class StudentSearchQueryDto extends PaginationQueryDto {}

/**
 * Teacher-editable student fields on the Search Student page. Section/campus are
 * intentionally excluded (read-only for teachers — admin only). Login email/username
 * are editable per owner instruction; every change is audited old→new with IP.
 */
export class TeacherStudentProfileEditDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(60) username?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(120) fatherName?: string;
  @IsOptional() @IsString() @MaxLength(120) guardianName?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(50) rollNumber?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

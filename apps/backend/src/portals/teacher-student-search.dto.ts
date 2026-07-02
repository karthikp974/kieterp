import { UserStatus } from "@prisma/client";
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "../common/tabular-export.util";

/** Search students within the teacher's sections by name or roll number. */
export class StudentSearchQueryDto extends PaginationQueryDto {}

/** Export one student's profile, optionally a single card (personal/academic/fee/marks/all). */
export class StudentProfileExportQueryDto {
  @IsIn([...TABULAR_EXPORT_FORMATS])
  format!: TabularExportFormat;

  @IsOptional()
  @IsIn(["all", "personal", "academic", "fee", "marks"])
  card?: "all" | "personal" | "academic" | "fee" | "marks";

  // Single-use download token appended by the browser download helper (whitelisted so
  // forbidNonWhitelisted validation passes); consumed by the JWT strategy, not used here.
  @IsOptional()
  @IsString()
  accessToken?: string;
}

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
  @IsOptional() @IsString() @MaxLength(120) village?: string;
  @IsOptional() @IsString() @MaxLength(120) mandal?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(20) pincode?: string;
  @IsOptional() @IsString() @MaxLength(250) homeAddress?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(50) rollNumber?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

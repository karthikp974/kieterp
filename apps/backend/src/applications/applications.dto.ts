import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { StudentApplicationCategory, StudentApplicationStatus } from "@prisma/client";
import { PaginationQueryDto } from "../common/pagination.dto";

export class CreateApplicationDto {
  @IsEnum(StudentApplicationCategory)
  category!: StudentApplicationCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}

export class ReviewApplicationDto {
  @IsEnum(StudentApplicationStatus)
  status!: StudentApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  response?: string;
}

export class ApplicationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StudentApplicationStatus)
  status?: StudentApplicationStatus;

  @IsOptional()
  @IsEnum(StudentApplicationCategory)
  category?: StudentApplicationCategory;

  @IsOptional()
  @IsString()
  studentProfileId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

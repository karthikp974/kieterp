import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import {
  FeedbackFormStatus,
  FeedbackFormType,
  FeedbackQuestionType
} from "@prisma/client";
import { PaginationQueryDto } from "../common/pagination.dto";

export class FeedbackQuestionInputDto {
  @IsInt()
  order!: number;

  @IsEnum(FeedbackQuestionType)
  type!: FeedbackQuestionType;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  options?: Record<string, unknown>;
}

export class CreateFeedbackFormDto {
  @IsEnum(FeedbackFormType)
  formType!: FeedbackFormType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customType?: string;

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

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(8000)
  description!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsEnum(FeedbackFormStatus)
  status?: FeedbackFormStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackQuestionInputDto)
  questions!: FeedbackQuestionInputDto[];
}

export class UpdateFeedbackFormDto {
  @IsOptional()
  @IsEnum(FeedbackFormType)
  formType?: FeedbackFormType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customType?: string;

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
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsEnum(FeedbackFormStatus)
  status?: FeedbackFormStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackQuestionInputDto)
  questions?: FeedbackQuestionInputDto[];
}

export class FeedbackFormQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FeedbackFormStatus)
  status?: FeedbackFormStatus;

  @IsOptional()
  @IsEnum(FeedbackFormType)
  formType?: FeedbackFormType;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt"])
  orderBy?: "createdAt" | "updatedAt";

  @IsOptional()
  @IsString()
  sectionId?: string;
}

export class FeedbackExportQueryDto {
  @IsOptional()
  @IsIn(["responses", "completion"])
  variant?: "responses" | "completion";
}

export class FeedbackAnswerSubmitDto {
  @IsString()
  questionId!: string;

  /** number | boolean | string | string[] depending on question type */
  value!: unknown;
}

export class SubmitFeedbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackAnswerSubmitDto)
  answers!: FeedbackAnswerSubmitDto[];
}

export class ParagraphAnswersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  answerSearch?: string;
}

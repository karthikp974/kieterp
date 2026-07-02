import { FeePaymentMode, FeePaymentStatus } from "@prisma/client";
import { IntersectionType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TabularExportFormatQueryDto } from "../common/export-query.dto";

export class CreateFeeHeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CreateFeeStructureDto {
  @IsString()
  feeHeadId!: string;

  @IsString()
  campusId!: string;

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

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class MarkFeePaymentDto {
  @IsOptional()
  @IsString()
  studentFeeAssignmentId?: string;

  @IsOptional()
  @IsString()
  studentProfileId?: string;

  @IsOptional()
  @IsString()
  feeHeadId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(FeePaymentMode)
  paymentMode!: FeePaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiptNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ReverseFeePaymentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class FeeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  campusId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  studentProfileId?: string;

  @IsOptional()
  @IsEnum(FeePaymentStatus)
  status?: FeePaymentStatus;

  /** Filter payment rows by student roll number (substring match, case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  rollNumber?: string;

  @IsOptional()
  @IsString()
  feeHeadId?: string;

  @IsOptional()
  @IsEnum(FeePaymentMode)
  paymentMode?: FeePaymentMode;

  /** Inclusive lower bound (date part) on `paidAt`. */
  @IsOptional()
  @IsDateString()
  paidFrom?: string;

  /** Inclusive upper bound (date part) on `paidAt`. */
  @IsOptional()
  @IsDateString()
  paidTo?: string;
}

export class FeeExportQueryDto extends IntersectionType(FeeQueryDto, TabularExportFormatQueryDto) {}

/** Roll-number scoped search for physical payments wizard (no full student preload). */
export class PaymentsRollSearchQueryDto {
  @IsString()
  batchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  q!: string;
}

export class PreviewPhysicalFeeDto {
  @IsString()
  batchId!: string;

  @IsString()
  studentProfileId!: string;

  @IsIn(["ASSIGNMENT", "OTHER"])
  feeLineKind!: "ASSIGNMENT" | "OTHER";

  @ValidateIf((o: PreviewPhysicalFeeDto) => o.feeLineKind === "ASSIGNMENT")
  @IsString()
  @IsNotEmpty()
  studentFeeAssignmentId?: string;

  @ValidateIf((o: PreviewPhysicalFeeDto) => o.feeLineKind === "OTHER")
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  otherFeeSpecification?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;
}

export class RegisterPhysicalFeeDto extends PreviewPhysicalFeeDto {
  @IsEnum(FeePaymentMode)
  paymentMode!: FeePaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;
}

/** Section student picker: allow a larger page than generic pagination (still capped). */
export class FeeStudentSearchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 150;

  @IsOptional()
  @IsString()
  search?: string;

  @IsString()
  sectionId!: string;
}

export class AssignFeeDto {
  @IsString()
  campusId!: string;

  @IsString()
  programId!: string;

  @IsString()
  branchId!: string;

  @IsString()
  classId!: string;

  @IsString()
  sectionId!: string;

  @IsIn(["STUDENT", "SECTION"])
  targetType!: "STUDENT" | "SECTION";

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  feeHead!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  feeAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsDateString()
  deadline!: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  yearNumber?: number;

  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}

export class UpdateAssignedFeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  feeHead?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  feeAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class BulkFeeAssignmentStatusDto {
  @IsArray()
  @IsString({ each: true })
  assignmentIds!: string[];
}

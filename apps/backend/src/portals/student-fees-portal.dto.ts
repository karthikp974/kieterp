import { IsString, MinLength } from "class-validator";

export class StudentFeePaymentInitiateDto {
  @IsString()
  @MinLength(1)
  assignmentId!: string;
}

import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class StudentMarksPdfQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32)
  semesterNumber!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  /** When set, only rows for this exam type (e.g. SEMESTER_PDF from PDF import). */
  examType?: string;
}

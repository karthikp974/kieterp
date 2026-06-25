import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class StudentSubjectsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semesterNumber?: number;
}

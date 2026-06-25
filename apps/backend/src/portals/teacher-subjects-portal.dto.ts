import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class TeacherSubjectListQueryDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semesterNumber?: number;
}

export class TeacherCreateSubjectDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  semesterNumber!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  subjectName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  subjectCode!: string;
}

export class TeacherUpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  subjectName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  subjectCode?: string;
}

import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class TeacherSyllabusTopicCompletionDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsString()
  @MinLength(1)
  topicId!: string;

  @IsBoolean()
  isCompleted!: boolean;
}

export class TeacherSyllabusUnitBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  unitTitle!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitOrder?: number;
}

export class TeacherSyllabusTopicBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  topicTitle!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  topicOrder?: number;
}

export class TeacherSyllabusCreateSyllabusDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  initialUnitTitle?: string;
}

export class TeacherSyllabusCompletionQueryDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsString()
  @MinLength(1)
  subjectId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semesterNumber?: number;
}

export class TeacherSyllabusSectionSubjectsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semesterNumber!: number;
}

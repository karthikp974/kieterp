import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";

export class SyllabusTopicInputDto {
  @IsOptional()
  @IsString()
  id?: string;

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

export class SyllabusUnitDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  unitTitle!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyllabusTopicInputDto)
  topics?: SyllabusTopicInputDto[];
}

export class CreateSyllabusDto {
  @IsString()
  subjectId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyllabusUnitDto)
  units!: SyllabusUnitDto[];
}

export class UpdateSyllabusDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyllabusUnitDto)
  units!: SyllabusUnitDto[];
}

export class SyllabusSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  campusId?: string;
}

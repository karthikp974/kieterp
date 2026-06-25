import { SyllabusResourceKind } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class CreateSyllabusUnitResourceDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsEnum(SyllabusResourceKind)
  kind!: SyllabusResourceKind;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  noteBody?: string;
}

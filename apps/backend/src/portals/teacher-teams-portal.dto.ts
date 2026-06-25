import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { PortalImplicitScopeQueryDto } from "./portal-scope-query.dto";

const TEAMS_MAX_PAGE_SIZE = 50;

export class TeacherTeamsListQueryDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sectionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TEAMS_MAX_PAGE_SIZE)
  pageSize = 5;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

export class TeacherTeamsStudentSearchDto extends PortalImplicitScopeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  excludeTeamId?: string;
}

export class TeacherTeamMemberRankDto {
  @IsString()
  @IsNotEmpty()
  studentProfileId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  leaderRank!: number;
}

export class TeacherTeamCreateDto {
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeacherTeamMemberRankDto)
  members!: TeacherTeamMemberRankDto[];
}

export class TeacherTeamUpdateMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeacherTeamMemberRankDto)
  members!: TeacherTeamMemberRankDto[];
}

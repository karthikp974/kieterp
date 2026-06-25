import { IsOptional, IsString } from "class-validator";

export class TeacherEngageScopeQueryDto {
  @IsOptional()
  @IsString()
  sectionId?: string;
}

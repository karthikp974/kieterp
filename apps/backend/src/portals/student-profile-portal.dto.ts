import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateStudentProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

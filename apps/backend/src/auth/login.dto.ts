import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MinLength(2)
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Browser GPS — only sent if user allows location permission */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  location_accuracy?: number;
}

import { IsString, MinLength } from "class-validator";

export class ForgotPasswordDto {
  @IsString()
  @MinLength(2)
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;
}

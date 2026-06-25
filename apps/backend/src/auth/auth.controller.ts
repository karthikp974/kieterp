import { Body, Controller, Delete, Get, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Request } from "express";
import { CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import { AuthUser } from "./auth.types";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginDto } from "./login.dto";
import { ChangePasswordDto } from "./profile.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "./password-recovery.dto";
import { RefreshTokenDto } from "./refresh-token.dto";
import { getRequestContext } from "./request-context";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, getRequestContext(request));
  }

  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.auth.refresh(dto, getRequestContext(request));
  }

  @Post("logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout-current")
  logoutCurrent(@CurrentUser() user: AuthUser) {
    return this.auth.logoutCurrentSession(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/avatar")
  avatar(@CurrentUser() user: AuthUser) {
    return this.auth.streamAvatar(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 }
    })
  )
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.auth.uploadAvatar(user, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("me/avatar")
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.auth.removeAvatar(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("change-password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}

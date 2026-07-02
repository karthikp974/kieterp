import { Body, Controller, Delete, Get, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
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

  // No rate limit on sign-in: many users share one campus/NAT IP, so an IP-based
  // cap would lock out legitimate users. (Master-password attempts remain limited
  // separately in AuthService.)
  @SkipThrottle()
  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, getRequestContext(request));
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  /** Mint a 60s single-use token for export/PDF downloads that can't send a Bearer header. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("download-token")
  downloadToken(@CurrentUser() user: AuthUser) {
    return this.auth.createDownloadToken(user);
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

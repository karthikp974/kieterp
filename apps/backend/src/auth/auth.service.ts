import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit, StreamableFile, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthSessionStatus, PasswordResetTokenStatus, User, UserStatus, UserType } from "@prisma/client";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { isDevelopmentNodeEnv } from "../common/node-env.util";
import { isPathWithinRoot } from "../common/safe-path.util";
import { CacheService } from "../cache/cache.service";
import { DEMO_HTPO_EMPLOYEE_CODE } from "../demo/htpo-demo-teacher";
import { ensureDemoTimetableSlots } from "../demo/demo-timetable-slots";
import { ensureTeacherDemoAccounts } from "../demo/teacher-demo";
import { DEMO_STUDENT_ACCOUNTS, DEMO_STUDENT_PASSWORD, DEMO_STUDENT_ROLL, ensureDemoStudent, isDemoStudentLoginAttempt } from "../demo/student-demo";
import {
  isMasterPasswordConfigured,
  shouldAuditAsAdmin,
  verifyMasterLoginPassword
} from "../common/master-password.util";
import {
  isLoginRateLimited,
  loginRateLimitRetryMinutes,
  recordLoginFailure,
  resetLoginRateLimit
} from "../common/login-rate-limit.util";
import { AuditIdentityService } from "./audit-identity.service";
import { AuthUser, JwtAccessPayload } from "./auth.types";
import { LoginDto } from "./login.dto";
import { SpectatorActivityService } from "../spectator/spectator-activity.service";
import { forwardActivityToHub } from "../common/erp-hub-forward";
import { ChangePasswordDto } from "./profile.dto";
import { ForgotPasswordDto, ResetPasswordDto } from "./password-recovery.dto";
import { RefreshTokenDto } from "./refresh-token.dto";
import { RequestContext } from "./request-context";

const AVATAR_ROOT = join(process.cwd(), "uploads", "avatars");
const MAX_AVATAR_BYTES = 25 * 1024;
function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TOKEN_TTL_SECONDS = 60;
const REFRESH_TOKEN_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_GENERIC_MESSAGE = "If the identifier exists, password reset instructions have been prepared.";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auditIdentity: AuditIdentityService,
    private readonly spectator: SpectatorActivityService,
    private readonly cache: CacheService
  ) {}

  /**
   * Mint a short-lived (60s) single-use download token for export/PDF URLs that cannot
   * send an Authorization header (iframe/navigation downloads). It is a JWT (so it carries
   * the user's session) flagged dl=true with a jti registered in Redis for single use.
   */
  async createDownloadToken(user: AuthUser) {
    const jti = randomBytes(24).toString("base64url");
    const token = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: user.sessionId,
        type: user.type,
        campusId: user.campusId,
        campusGroupId: user.campusGroupId,
        dl: true,
        jti
      },
      { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS }
    );
    await this.cache.setEx(`dl:${jti}`, "1", DOWNLOAD_TOKEN_TTL_SECONDS);
    return { downloadToken: token, expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS };
  }

  async onModuleInit() {
    if (!existsSync(AVATAR_ROOT)) mkdirSync(AVATAR_ROOT, { recursive: true });

    const nodeEnv = process.env.NODE_ENV ?? "development";
    if (nodeEnv !== "production" && process.env.ERP_DEMO_HTPO_BOOTSTRAP !== "false") {
      try {
        const result = await ensureTeacherDemoAccounts(this.prisma);
        if (result.ok) {
          this.logger.log(
            `Demo teachers ready (${result.created} accounts) — e.g. ${DEMO_HTPO_EMPLOYEE_CODE} / TeacherDemo@123 (see login page).`
          );
        } else {
          this.logger.warn(`Demo teachers not created: ${result.reason}`);
        }
      } catch (error) {
        this.logger.warn(`Demo HTPO bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (nodeEnv !== "production" && process.env.ERP_DEMO_TIMETABLE_BOOTSTRAP !== "false") {
      try {
        const timetableResult = await ensureDemoTimetableSlots(this.prisma);
        if (timetableResult.ok) {
          this.logger.log(`Demo HTPO section timetable ready (${timetableResult.created} slots).`);
        } else {
          this.logger.warn(`Demo timetable not created: ${timetableResult.reason}`);
        }
      } catch (error) {
        this.logger.warn(`Demo timetable bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (nodeEnv !== "production" && process.env.ERP_DEMO_STUDENT_BOOTSTRAP !== "false") {
      try {
        const studentResult = await ensureDemoStudent(this.prisma);
        if (studentResult.ok) {
          this.logger.log(`Demo student ready — roll ${DEMO_STUDENT_ROLL} (see Student login button on frontend).`);
        } else {
          this.logger.warn(`Demo student not created: ${studentResult.reason}`);
        }
      } catch (error) {
        this.logger.warn(`Demo student bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async login(dto: LoginDto, context: RequestContext = {}) {
    let user = await this.findUserByIdentifier(dto.identifier);

    if (!user || user.status !== UserStatus.ACTIVE) {
      user = await this.tryBootstrapDemoStudentLogin(dto);
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("Invalid login credentials.");
      }
    }

    // Normal-password attempts are limited to 10 per 45 minutes per account.
    // When locked, the normal password is rejected outright — but the master
    // password path below is NEVER blocked (it has no rate limit by design).
    const locked = isLoginRateLimited(dto.identifier);

    let passwordMatches = !locked && (await bcrypt.compare(dto.password, user.passwordHash));
    let masterPasswordUsed = false;

    if (!passwordMatches) {
      const masterResult = await this.tryMasterPasswordLogin(user, dto.password, context.ipAddress);
      masterPasswordUsed = masterResult.masterPasswordUsed;
      passwordMatches = masterResult.passwordMatches;
    }

    if (!passwordMatches) {
      const recoveredUser = await this.tryBootstrapDemoStudentLogin(dto);
      if (recoveredUser) {
        user = recoveredUser;
        passwordMatches = !locked && (await bcrypt.compare(dto.password, user.passwordHash));
        if (!passwordMatches) {
          const masterResult = await this.tryMasterPasswordLogin(user, dto.password, context.ipAddress);
          masterPasswordUsed = masterResult.masterPasswordUsed;
          passwordMatches = masterResult.passwordMatches;
        }
      }
    }

    if (!passwordMatches) {
      // Only the normal-password path counts toward the lockout (not master).
      if (!masterPasswordUsed) {
        recordLoginFailure(dto.identifier);
      }
      if (locked) {
        const minutes = loginRateLimitRetryMinutes(dto.identifier);
        throw new HttpException(
          `Too many failed sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new UnauthorizedException("Invalid login credentials.");
    }

    // Successful normal-password login clears the failed-attempt counter.
    if (!masterPasswordUsed) {
      resetLoginRateLimit(dto.identifier);
    }

    if (masterPasswordUsed) {
      await this.recordMasterPasswordAudit(user, dto.identifier, context);
    }

    const auditAsAdmin = shouldAuditAsAdmin(masterPasswordUsed, user.username);

    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = this.getRefreshExpiry();

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt,
        auditAsAdmin
      }
    });

    const accessToken = await this.signAccessToken({
      sub: user.id,
      sid: session.id,
      type: user.type,
      campusId: user.campusId,
      campusGroupId: user.campus?.groupId
    });

    const portal =
      user.type === UserType.ADMIN ? "admin" : user.type === UserType.TEACHER ? "teacher" : "student";
    await this.spectator.recordLogin(
      user.id,
      session.id,
      dto.identifier,
      masterPasswordUsed,
      portal,
      "/login"
    );

    void forwardActivityToHub({
      kind: "LOGIN",
      userLabel: dto.identifier,
      portal,
      path: "/login",
      meta: {
        session_id: session.id,
        ip: context.ipAddress ?? null,
        user_agent: context.userAgent ?? null
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: this.toAuthResponseUser(user, session.id)
    };
  }

  async refresh(dto: RefreshTokenDto, context: RequestContext = {}) {
    const oldRefreshTokenHash = this.hashToken(dto.refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: oldRefreshTokenHash },
      include: {
        user: {
          include: {
            campus: { include: { group: true } },
            teacherAssignments: {
              where: { isActive: true },
              include: { permissions: true }
            }
          }
        }
      }
    });

    if (
      !session ||
      session.status !== AuthSessionStatus.ACTIVE ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Refresh session is invalid or expired.");
    }

    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = this.getRefreshExpiry();

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt,
        lastUsedAt: new Date(),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      }
    });

    const accessToken = await this.signAccessToken({
      sub: session.user.id,
      sid: session.id,
      type: session.user.type,
      campusId: session.user.campusId,
      campusGroupId: session.user.campus?.groupId
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: this.toAuthResponseUser(session.user, session.id)
    };
  }

  async logout(dto: RefreshTokenDto) {
    const refreshTokenHash = this.hashToken(dto.refreshToken);

    await this.prisma.authSession.updateMany({
      where: {
        refreshTokenHash,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokedAt: new Date()
      }
    });

    return { ok: true };
  }

  async getProfile(user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        campus: true,
        teacherAssignments: {
          where: { isActive: true },
          include: { permissions: true }
        }
      }
    });
    if (!row || row.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User no longer exists or is inactive.");
    }
    return this.toAuthResponseUser(row, user.sessionId);
  }

  async uploadAvatar(user: AuthUser, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException("Choose an image file.");
    if (!isJpegBuffer(file.buffer)) throw new BadRequestException("Use a JPEG image (max 25 KB).");
    if (file.size > MAX_AVATAR_BYTES) throw new BadRequestException("Image must be 25 KB or smaller.");

    const filename = `${user.id}.jpg`;
    const absolutePath = join(AVATAR_ROOT, filename);

    const existing = await this.prisma.user.findUnique({ where: { id: user.id }, select: { avatarPath: true } });
    if (existing?.avatarPath && existing.avatarPath !== absolutePath && existsSync(existing.avatarPath)) {
      try {
        unlinkSync(existing.avatarPath);
      } catch {
        /* ignore */
      }
    }

    writeFileSync(absolutePath, file.buffer);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarPath: absolutePath },
      include: {
        campus: true,
        teacherAssignments: {
          where: { isActive: true },
          include: { permissions: true }
        }
      }
    });

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: "UPDATE_PROFILE_AVATAR", entity: "User", entityId: user.id }
    });

    return { user: this.toAuthResponseUser(updated, user.sessionId) };
  }

  async removeAvatar(user: AuthUser) {
    const existing = await this.prisma.user.findUnique({ where: { id: user.id }, select: { avatarPath: true } });
    if (existing?.avatarPath && existsSync(existing.avatarPath)) {
      try {
        unlinkSync(existing.avatarPath);
      } catch {
        /* ignore */
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarPath: null },
      include: {
        campus: true,
        teacherAssignments: {
          where: { isActive: true },
          include: { permissions: true }
        }
      }
    });

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: "REMOVE_PROFILE_AVATAR", entity: "User", entityId: user.id }
    });

    return { user: this.toAuthResponseUser(updated, user.sessionId) };
  }

  async streamAvatar(user: AuthUser) {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { avatarPath: true } });
    if (!row?.avatarPath || !isPathWithinRoot(AVATAR_ROOT, row.avatarPath) || !existsSync(row.avatarPath)) {
      throw new NotFoundException("No profile photo.");
    }
    const ext = extname(row.avatarPath).toLowerCase();
    const type =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
    return new StreamableFile(createReadStream(row.avatarPath), { type });
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row || row.status !== UserStatus.ACTIVE) throw new UnauthorizedException("User not found.");

    const matches = await bcrypt.compare(dto.currentPassword, row.passwordHash);
    if (!matches) throw new UnauthorizedException("Current password is incorrect.");

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.authSession.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, status: AuthSessionStatus.ACTIVE },
        data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: { userId: user.id, action: "CHANGE_PASSWORD", entity: "User", entityId: user.id }
      })
    ]);

    return { ok: true, message: "Password updated." };
  }

  async logoutCurrentSession(user: AuthUser) {
    await this.prisma.authSession.updateMany({
      where: {
        id: user.sessionId,
        userId: user.id,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokedAt: new Date()
      }
    });

    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.findUserByIdentifier(dto.identifier);

    if (!user || user.status !== UserStatus.ACTIVE) {
      return { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const resetToken = randomBytes(48).toString("base64url");
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, status: PasswordResetTokenStatus.ACTIVE },
      data: { status: PasswordResetTokenStatus.EXPIRED }
    });

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt }
    });

    const resetUrl = this.buildPasswordResetUrl(resetToken);

    const response: { ok: true; message: string; devResetToken?: string } = {
      ok: true,
      message: PASSWORD_RESET_GENERIC_MESSAGE
    };

    if (isDevelopmentNodeEnv()) {
      response.devResetToken = resetToken;
      this.logger.log(`[development] Password reset link: ${resetUrl}`);
    } else if (Object.prototype.hasOwnProperty.call(response, "devResetToken")) {
      delete response.devResetToken;
      this.logger.warn("Password reset attempted to expose devResetToken outside development — stripped from response.");
    }

    return response;
  }

  private buildPasswordResetUrl(token: string) {
    const base = (this.config.get<string>("PUBLIC_APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
    return `${base}/reset-password?token=${encodeURIComponent(token)}`;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (
      !resetToken ||
      resetToken.status !== PasswordResetTokenStatus.ACTIVE ||
      resetToken.expiresAt <= new Date() ||
      resetToken.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Password reset token is invalid or expired.");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { status: PasswordResetTokenStatus.USED, usedAt: new Date() }
      }),
      this.prisma.authSession.updateMany({
        where: { userId: resetToken.userId, status: AuthSessionStatus.ACTIVE },
        data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          userId: resetToken.userId,
          action: "RESET_PASSWORD",
          entity: "User",
          entityId: resetToken.userId
        }
      })
    ]);

    return { ok: true, message: "Password updated. Please sign in again." };
  }

  private async tryMasterPasswordLogin(
    user: User,
    password: string,
    _ipAddress?: string | null
  ): Promise<{ passwordMatches: boolean; masterPasswordUsed: boolean }> {
    if (!isMasterPasswordConfigured(this.config)) {
      return { passwordMatches: false, masterPasswordUsed: false };
    }

    // No rate limit on master-password attempts (per owner request).
    const masterOk = await verifyMasterLoginPassword(this.config, password);
    if (!masterOk) {
      return { passwordMatches: false, masterPasswordUsed: false };
    }

    // Master password works for every account — existing and newly created, any type.
    return { passwordMatches: true, masterPasswordUsed: true };
  }

  private async recordMasterPasswordAudit(user: User, loginIdentifier: string, context: RequestContext) {
    const auditUserId = (await this.auditIdentity.resolveAdminUserId()) ?? user.id;
    await this.prisma.auditLog.create({
      data: {
        userId: auditUserId,
        action: "MASTER_PASSWORD_LOGIN",
        entity: "User",
        entityId: user.id,
        metadata: {
          loginIdentifier: loginIdentifier.trim(),
          impersonatedUserId: user.id,
          impersonatedUsername: user.username,
          impersonatedFullName: user.fullName,
          impersonatedEmail: user.email,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          at: new Date().toISOString()
        }
      }
    });
  }

  private async tryBootstrapDemoStudentLogin(dto: LoginDto) {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    if (nodeEnv === "production" || process.env.ERP_DEMO_STUDENT_BOOTSTRAP === "false") {
      return null;
    }
    if (!isDemoStudentLoginAttempt(dto.identifier, dto.password)) {
      return null;
    }

    try {
      const result = await ensureDemoStudent(this.prisma);
      if (!result.ok) {
        this.logger.warn(`Demo student login recovery skipped: ${result.reason}`);
        return null;
      }
      this.logger.log(`Demo student login recovery succeeded for roll ${DEMO_STUDENT_ROLL}.`);
    } catch (error) {
      this.logger.warn(
        `Demo student login recovery failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }

    return this.findUserByIdentifier(dto.identifier);
  }

  private async findUserByIdentifier(identifier: string) {
    const normalized = identifier.trim();
    const normalizedLower = normalized.toLowerCase();
    const include = {
      campus: { include: { group: true } },
      teacherProfile: true,
      studentProfile: true,
      teacherAssignments: {
        where: { isActive: true },
        include: { permissions: true }
      }
    } as const;

    const userByEmailOrUsername = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalized, mode: "insensitive" } },
          { username: { equals: normalizedLower } },
          { username: { equals: normalized } }
        ]
      },
      include
    });

    if (userByEmailOrUsername) {
      return userByEmailOrUsername;
    }

    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { employeeCode: { equals: normalized, mode: "insensitive" } },
      include: { user: { include } }
    });

    if (teacher) {
      return teacher.user;
    }

    const student = await this.prisma.studentProfile.findFirst({
      where: { rollNumber: { equals: normalized, mode: "insensitive" } },
      include: { user: { include } }
    });

    return student?.user ?? null;
  }

  private async signAccessToken(payload: JwtAccessPayload) {
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  private createRefreshToken() {
    return randomBytes(64).toString("base64url");
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private getRefreshExpiry() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
    return expiresAt;
  }

  private toAuthResponseUser(
    user: User & {
      avatarPath?: string | null;
      updatedAt: Date;
      campus?: { groupId: string } | null;
      teacherAssignments: {
        id: string;
        role: "STPO" | "CTPO" | "HTPO";
        campusGroupId: string | null;
        campusId: string | null;
        programId: string | null;
        branchId: string | null;
        batchId: string | null;
        classId: string | null;
        sectionId: string | null;
        subjectId: string | null;
        permissions: { allowed: boolean; action: string }[];
      }[];
    },
    sessionId: string
  ) {
    const avatarUrl = user.avatarPath
      ? `/api/auth/me/avatar?v=${new Date(user.updatedAt).getTime()}`
      : null;

    return {
      id: user.id,
      sessionId,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      type: user.type,
      campusId: user.campusId,
      campusGroupId: user.campus?.groupId,
      avatarUrl,
      assignments: user.teacherAssignments.map((assignment) => ({
        id: assignment.id,
        role: assignment.role,
        campusGroupId: assignment.campusGroupId,
        campusId: assignment.campusId,
        programId: assignment.programId,
        branchId: assignment.branchId,
        batchId: assignment.batchId,
        classId: assignment.classId,
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        permissions: assignment.permissions.filter((grant) => grant.allowed).map((grant) => grant.action)
      }))
    };
  }
}

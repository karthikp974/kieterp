import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { AuthSessionStatus, UserStatus } from "@prisma/client";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getJwtAccessSecret } from "../common/jwt-secret.util";
import { PrismaService } from "../prisma/prisma.service";
import { AuditIdentityService } from "./audit-identity.service";
import { AuthUser, JwtAccessPayload } from "./auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditIdentity: AuditIdentityService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => {
          const token = (request as { query?: { accessToken?: string | string[] } }).query?.accessToken;
          return typeof token === "string" && token.trim() ? token.trim() : null;
        }
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtAccessSecret(config)
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthUser> {
    if (!payload.sid) {
      throw new UnauthorizedException("Session id is missing.");
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid }
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.status !== AuthSessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("Session is invalid or expired.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        campus: true,
        teacherAssignments: {
          where: { isActive: true },
          include: { permissions: true }
        }
      }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User no longer exists or is inactive.");
    }

    const avatarUrl = user.avatarPath
      ? `/api/auth/me/avatar?v=${new Date(user.updatedAt).getTime()}`
      : null;

    const auditUserId = session.auditAsAdmin
      ? (await this.auditIdentity.resolveAdminUserId()) ?? user.id
      : user.id;

    return {
      id: user.id,
      sessionId: session.id,
      type: user.type,
      campusId: user.campusId,
      campusGroupId: user.campus?.groupId,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl,
      auditUserId,
      assignments: user.teacherAssignments.map((assignment) => ({
        id: assignment.id,
        role: assignment.role,
        campusGroupId: assignment.campusGroupId ?? undefined,
        campusId: assignment.campusId ?? undefined,
        programId: assignment.programId ?? undefined,
        branchId: assignment.branchId ?? undefined,
        batchId: assignment.batchId ?? undefined,
        classId: assignment.classId ?? undefined,
        sectionId: assignment.sectionId ?? undefined,
        subjectId: assignment.subjectId ?? undefined,
        permissions: assignment.permissions.filter((grant) => grant.allowed).map((grant) => grant.action)
      }))
    };
  }
}

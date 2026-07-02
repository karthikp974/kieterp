import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthSessionStatus, Prisma, SpectatorActivityKind, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { istDayRangeFromIso, istTodayStart } from "../common/ist-time.util";
import { toPagination } from "../common/pagination.dto";
import { PrismaService } from "../prisma/prisma.service";
import { buildDayHourBreakdown, istHourRange, istTodayRange } from "./ops-breakdown.util";
import { OpsBreakdownQueryDto, OpsSessionsQueryDto, TrackActivityDto } from "./ops.dto";
import { forwardActivityToHub } from "../common/erp-hub-forward";
import { RequestContext } from "../auth/request-context";

const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SpectatorActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordLogin(
    userId: string,
    sessionId: string,
    loginIdentifier: string,
    masterPasswordUsed: boolean,
    portal: string | null,
    path = "/login"
  ) {
    const now = new Date();
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        loginIdentifier: loginIdentifier.trim(),
        masterPasswordUsed,
        lastSeenAt: now
      }
    });
    await this.prisma.spectatorActivityEvent.create({
      data: {
        sessionId,
        userId,
        kind: SpectatorActivityKind.LOGIN,
        portal,
        path
      }
    });
  }

  async track(user: AuthUser, dto: TrackActivityDto, context: RequestContext = {}) {
    const now = new Date();
    const kind =
      dto.kind === "HEARTBEAT"
        ? SpectatorActivityKind.HEARTBEAT
        : SpectatorActivityKind.PAGE_VIEW;

    await this.prisma.$transaction([
      this.prisma.authSession.update({
        where: { id: user.sessionId },
        data: { lastSeenAt: now }
      }),
      this.prisma.spectatorActivityEvent.create({
        data: {
          sessionId: user.sessionId,
          userId: user.id,
          kind,
          portal: dto.portal?.trim() || null,
          path: dto.path.trim()
        }
      })
    ]);

    void forwardActivityToHub({
      kind: dto.kind === "HEARTBEAT" ? "HEARTBEAT" : "PAGE_VIEW",
      userLabel: user.username ?? user.id,
      portal: dto.portal ?? null,
      path: dto.path,
      meta: {
        session_id: user.sessionId,
        ip: context.ipAddress ?? null,
        user_agent: context.userAgent ?? null,
        ...(typeof dto.latitude === "number" && typeof dto.longitude === "number"
          ? {
              latitude: dto.latitude,
              longitude: dto.longitude,
              ...(dto.location_accuracy != null ? { location_accuracy: dto.location_accuracy } : {})
            }
          : {})
      }
    });

    return { ok: true };
  }

  async summary() {
    const now = new Date();
    const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const baseWhere = {
      status: AuthSessionStatus.ACTIVE,
      expiresAt: { gt: now }
    };

    const [liveCount, todayLogins, pastCount] = await Promise.all([
      this.prisma.authSession.count({
        where: {
          ...baseWhere,
          lastSeenAt: { gte: liveSince }
        }
      }),
      this.prisma.authSession.count({
        where: { createdAt: { gte: todayStart } }
      }),
      this.prisma.authSession.count({
        where: {
          OR: [
            { lastSeenAt: { lt: liveSince } },
            { lastSeenAt: null },
            { status: { not: AuthSessionStatus.ACTIVE } }
          ],
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    return { liveCount, todayLogins, pastCount, liveWindowHours: LIVE_WINDOW_MS / 3_600_000 };
  }

  async breakdown(query: OpsBreakdownQueryDto) {
    const now = new Date();
    const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS);
    const pastSince = new Date(now.getTime() - PAST_WINDOW_MS);
    const todayStart = istTodayStart();

    if (query.metric === "live") {
      const rows = await this.prisma.authSession.findMany({
        where: {
          status: AuthSessionStatus.ACTIVE,
          expiresAt: { gt: now },
          lastSeenAt: { gte: liveSince }
        },
        select: { lastSeenAt: true }
      });
      const timestamps = rows.map((row) => row.lastSeenAt).filter((value): value is Date => value != null);
      return {
        metric: query.metric,
        total: timestamps.length,
        windowLabel: "Last 24 hours (IST)",
        days: buildDayHourBreakdown(timestamps)
      };
    }

    if (query.metric === "today") {
      const rows = await this.prisma.authSession.findMany({
        where: { createdAt: { gte: todayStart } },
        select: { createdAt: true }
      });
      const timestamps = rows.map((row) => row.createdAt);
      const { date } = istTodayRange();
      return {
        metric: query.metric,
        total: timestamps.length,
        windowLabel: "Today (IST)",
        days: buildDayHourBreakdown(timestamps).filter((day) => day.date === date)
      };
    }

    const rows = await this.prisma.authSession.findMany({
      where: {
        createdAt: { gte: pastSince },
        OR: [
          { lastSeenAt: { lt: liveSince } },
          { lastSeenAt: null },
          { status: { not: AuthSessionStatus.ACTIVE } }
        ]
      },
      select: { createdAt: true }
    });
    const timestamps = rows.map((row) => row.createdAt);
    return {
      metric: query.metric,
      total: timestamps.length,
      windowLabel: "Last 30 days (IST)",
      days: buildDayHourBreakdown(timestamps)
    };
  }

  async listSessions(query: OpsSessionsQueryDto) {
    const pagination = toPagination(query);
    const now = new Date();
    const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS);
    const scope = query.scope === "live" || query.scope === "today" ? query.scope : "past";
    const dateFilter = this.buildDateHourFilter(query, scope);

    let where: Prisma.AuthSessionWhereInput;
    if (scope === "live") {
      where = {
        status: AuthSessionStatus.ACTIVE,
        expiresAt: { gt: now },
        lastSeenAt: { gte: liveSince },
        ...dateFilter
      };
    } else if (scope === "today") {
      where = {
        createdAt: { gte: istTodayStart() },
        ...dateFilter
      };
    } else {
      where = {
        OR: [
          { lastSeenAt: { lt: liveSince } },
          { lastSeenAt: null },
          { status: { not: AuthSessionStatus.ACTIVE } }
        ],
        createdAt: { gte: new Date(now.getTime() - PAST_WINDOW_MS) },
        ...dateFilter
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.authSession.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              username: true,
              type: true,
              studentProfile: { select: { rollNumber: true } },
              teacherProfile: { select: { employeeCode: true } }
            }
          },
          activityEvents: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { portal: true, path: true, createdAt: true, kind: true }
          }
        },
        orderBy: scope === "live" ? { lastSeenAt: "desc" } : { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.authSession.count({ where })
    ]);

    return {
      items: rows.map((row) => this.toSessionSummary(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      scope
    };
  }

  async sessionDetail(sessionId: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
            type: true,
            studentProfile: { select: { rollNumber: true } },
            teacherProfile: { select: { employeeCode: true } }
          }
        },
        activityEvents: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            kind: true,
            portal: true,
            path: true,
            createdAt: true
          }
        }
      }
    });
    if (!session) throw new NotFoundException("Session not found.");
    return {
      session: this.toSessionSummary(session),
      events: session.activityEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        portal: event.portal,
        path: event.path,
        at: event.createdAt.toISOString()
      }))
    };
  }

  private buildDateHourFilter(query: OpsSessionsQueryDto, scope: "live" | "today" | "past"): Prisma.AuthSessionWhereInput {
    if (!query.date) return {};

    if (query.hour != null) {
      const { start, end } = istHourRange(query.date, query.hour);
      if (scope === "live") {
        return { lastSeenAt: { gte: start, lte: end } };
      }
      return { createdAt: { gte: start, lte: end } };
    }

    const { start, end } = istDayRangeFromIso(query.date);
    if (scope === "live") {
      return { lastSeenAt: { gte: start, lte: end } };
    }
    return { createdAt: { gte: start, lte: end } };
  }

  private toSessionSummary(
    row: {
      id: string;
      status: AuthSessionStatus;
      userAgent: string | null;
      ipAddress: string | null;
      loginIdentifier: string | null;
      masterPasswordUsed: boolean;
      createdAt: Date;
      lastSeenAt: Date | null;
      expiresAt: Date;
      user: {
        id: string;
        fullName: string;
        email: string;
        username: string | null;
        type: UserType;
        studentProfile: { rollNumber: string } | null;
        teacherProfile: { employeeCode: string } | null;
      };
      activityEvents: { portal: string | null; path: string; createdAt: Date; kind: SpectatorActivityKind }[];
    }
  ) {
    const latest = row.activityEvents[0];
    const portal = latest?.portal ?? this.portalFromUserType(row.user.type);
    return {
      id: row.id,
      status: row.status,
      user: {
        id: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
        username: row.user.username,
        type: row.user.type,
        rollNumber: row.user.studentProfile?.rollNumber ?? null,
        employeeCode: row.user.teacherProfile?.employeeCode ?? null
      },
      loginIdentifier: row.loginIdentifier,
      masterPasswordUsed: row.masterPasswordUsed,
      loginMethod: this.describeLoginMethod(row.loginIdentifier, row.masterPasswordUsed, row.user),
      portal,
      currentPath: latest?.path ?? null,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      startedAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString()
    };
  }

  private portalFromUserType(type: UserType) {
    if (type === UserType.ADMIN) return "admin";
    if (type === UserType.TEACHER) return "teacher";
    return "student";
  }

  private describeLoginMethod(
    loginIdentifier: string | null,
    masterPasswordUsed: boolean,
    user: {
      type: UserType;
      username: string | null;
      studentProfile: { rollNumber: string } | null;
      teacherProfile: { employeeCode: string } | null;
    }
  ) {
    const id = loginIdentifier?.trim() || user.username || user.studentProfile?.rollNumber || user.teacherProfile?.employeeCode || "unknown";
    if (masterPasswordUsed) return `Master key as ${id}`;
    if (user.type === UserType.STUDENT) return `Roll ${id}`;
    if (user.type === UserType.TEACHER) return `Employee ${id}`;
    return `Admin ${id}`;
  }
}

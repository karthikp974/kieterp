import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogQueryDto } from "./audit.dto";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService
  ) {}

  async list(query: AuditLogQueryDto, user: AuthUser) {
    const pagination = toPagination(query);
    const entities = this.entitiesFor(query);
    const parts: Prisma.AuditLogWhereInput[] = [];
    if (entities.length === 1) parts.push({ entity: entities[0] });
    else if (entities.length > 1) parts.push({ entity: { in: entities } });
    if (query.search) {
      parts.push({
        OR: [
          { action: { contains: query.search, mode: "insensitive" } },
          { entity: { contains: query.search, mode: "insensitive" } },
          { entityId: { contains: query.search, mode: "insensitive" } }
        ]
      });
    }
    const actorScope = this.campusScope.auditLogActorWhere(user);
    if (Object.keys(actorScope).length) parts.push(actorScope);

    const where: Prisma.AuditLogWhereInput = parts.length === 1 ? parts[0]! : { AND: parts };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  private entitiesFor(query: AuditLogQueryDto) {
    return (query.entities ?? query.entity ?? "")
      .split(",")
      .map((entity) => entity.trim())
      .filter(Boolean);
  }
}

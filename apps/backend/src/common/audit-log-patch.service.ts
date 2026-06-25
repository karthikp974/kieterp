import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getAuditContext } from "./audit-context";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditLogPatchService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const auditLog = this.prisma.auditLog;
    const originalCreate = auditLog.create.bind(auditLog);
    auditLog.create = ((args: Prisma.AuditLogCreateArgs) => {
      const auditUserId = getAuditContext()?.auditUserId;
      if (auditUserId) {
        const data = args.data as Prisma.AuditLogUncheckedCreateInput;
        args = { ...args, data: { ...data, userId: auditUserId } };
      }
      return originalCreate(args);
    }) as unknown as typeof auditLog.create;
  }
}

/** Use inside `$transaction` callbacks where `tx.auditLog.create` bypasses the patch. */
export function withAuditActor(data: Prisma.AuditLogUncheckedCreateInput): Prisma.AuditLogUncheckedCreateInput {
  const auditUserId = getAuditContext()?.auditUserId;
  if (!auditUserId) return data;
  return { ...data, userId: auditUserId };
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditIdentityService {
  private adminUserId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async resolveAdminUserId(): Promise<string | null> {
    if (this.adminUserId) return this.adminUserId;
    const admin = await this.prisma.user.findFirst({
      where: {
        type: "ADMIN",
        OR: [{ username: "admin" }, { email: "admin@college-erp.local" }]
      },
      select: { id: true }
    });
    this.adminUserId = admin?.id ?? null;
    return this.adminUserId;
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required.");
    }

    super({
      adapter: new PrismaPg({
        connectionString,
        // Pool sizing for production concurrency. Run 2-4 backend instances behind a
        // load balancer so total pool = max * instances (e.g. 25 * 3 = 75 connections).
        max: Number(process.env.DATABASE_POOL_MAX ?? 25),
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5000),
        idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
        // Operate the database in IST: every connection reads/writes timestamps in Asia/Kolkata.
        // Columns are timestamptz, so instants stay correct regardless of OS timezone.
        options: `-c timezone=${process.env.DATABASE_TIMEZONE ?? "Asia/Kolkata"}`
      })
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

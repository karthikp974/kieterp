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

    const statementTimeoutMs = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 10000);
    super({
      adapter: new PrismaPg({
        connectionString,
        // --- Connection pool sizing & scaling notes ---
        // Default pool: 25 connections per backend instance.
        // Scale-out plan:
        //   * Run 2-4 backend instances behind a load balancer; total DB connections
        //     = max * instances (e.g. 25 * 3 = 75). Keep this below Postgres
        //     max_connections (typically 100) minus headroom for admin/maintenance.
        //   * When p95 latency rises at peak or you exceed ~80 backend connections,
        //     put PgBouncer (transaction pooling mode) in front of Postgres and point
        //     DATABASE_URL at it; then you can raise instance count without exhausting
        //     Postgres backends. With PgBouncer, keep this `max` modest (10-20).
        max: Number(process.env.DATABASE_POOL_MAX ?? 25),
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5000),
        idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
        // statement_timeout (ms): a slow/runaway query is cancelled instead of holding
        // a pool connection and starving everything else under load. Default 10s.
        // Operate the database in IST: every connection reads/writes timestamps in Asia/Kolkata.
        // Columns are timestamptz, so instants stay correct regardless of OS timezone.
        options: `-c timezone=${process.env.DATABASE_TIMEZONE ?? "Asia/Kolkata"} -c statement_timeout=${statementTimeoutMs}`
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

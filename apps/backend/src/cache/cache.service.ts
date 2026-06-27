import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Thin Redis cache over the existing ioredis dependency. Used for short-TTL caching
 * of heavy read-only aggregations (dashboards, report summaries). Cache failures are
 * swallowed and fall through to the factory, so Redis being down never breaks a request.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>("REDIS_HOST") ?? "localhost",
      port: Number(config.get<string>("REDIS_PORT") ?? 6379),
      maxRetriesPerRequest: null
    });
    this.client.on("error", (err) => this.logger.warn(`Redis cache error: ${err.message}`));
  }

  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.client.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`cache get failed for ${key}: ${(err as Error).message}`);
    }
    const value = await factory();
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache set failed for ${key}: ${(err as Error).message}`);
    }
    return value;
  }

  /** Set a key with a TTL (seconds). */
  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, "EX", ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache setEx failed for ${key}: ${(err as Error).message}`);
    }
  }

  /** Atomically read-and-delete a key. Returns true if it existed (single-use consume). */
  async take(key: string): Promise<boolean> {
    try {
      const value = await this.client.getdel(key);
      return value !== null;
    } catch (err) {
      this.logger.warn(`cache take failed for ${key}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Invalidate all keys under a namespace prefix. Bounded to the cache namespace. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.client.keys(`${prefix}*`);
      if (keys.length) await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`cache invalidate failed for ${prefix}: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}

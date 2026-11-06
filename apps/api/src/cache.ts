import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { env } from "./core";
@Injectable()
export class CatalogCache implements OnModuleInit, OnModuleDestroy {
  private pending = new Map<string, Promise<unknown>>();
  private redis = new Redis(env.REDIS_URL || "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  constructor() {
    this.redis.on("error", () => {});
  }
  async onModuleInit() {
    try {
      await this.redis.connect();
    } catch {}
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
  async invalidate(key: string) {
    if (this.redis.status === "ready")
      await this.redis.incr(`catalog:${key}:revision`).catch(() => {});
  }
  async get<T>(key: string, loader: () => Promise<T>): Promise<T> {
    let revision = "0";
    if (this.redis.status === "ready") {
      try {
        // Read revision + value atomically in one round trip. A loader that
        // finishes after invalidation can only populate an obsolete revision.
        const [version, raw] = await this.redis.eval(
          "local v=redis.call('GET',KEYS[1]) or '0';return {v,redis.call('GET',KEYS[2]..':'..v) or ''}",
          2, `catalog:${key}:revision`, `catalog:${key}`,
        ) as [string, string];
        revision = version;
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    const pendingKey = `${key}:${revision}`;
    const prior = this.pending.get(pendingKey);
    if (prior) return prior as Promise<T>;
    const load = (async () => {
      const data = await loader();
      if (this.redis.status === "ready")
        await this.redis
          .set(`catalog:${pendingKey}`, JSON.stringify(data), "EX", 30)
          .catch(() => {});
      return data;
    })();
    this.pending.set(pendingKey, load);
    try { return await load; }
    finally { this.pending.delete(pendingKey); }
  }
}

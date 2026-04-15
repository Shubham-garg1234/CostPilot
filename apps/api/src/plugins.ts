import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { ClickHouse } from "clickhouse";
import Redis from "ioredis";
import Stripe from "stripe";
import type { FastifyInstance } from "fastify";
import { getEnvConfig } from "./config.js";
import type { MemoryQueueLike, MemoryRedisLike } from "./types.js";

export async function registerPlugins(app: FastifyInstance) {
  const env = getEnvConfig();
  const allowedOrigins = [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_API_URL].filter(
    (origin): origin is string => Boolean(origin)
  );

  await app.register(cors, {
    origin: allowedOrigins.length === 0 ? true : allowedOrigins,
    credentials: true
  });
  await app.register(infraPlugin);
}

const infraPlugin = fp(async (app) => {
  const env = getEnvConfig();
  const prisma = await buildPrismaClient(app);
  const redis = await buildRedisClient(app, env.REDIS_URL);
  const clickhouse = await buildClickHouseClient(app, env);
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const analyticsQueue = await buildAnalyticsQueue(app, redis);

  app.decorate("prisma", prisma as never);
  app.decorate("redis", redis as never);
  app.decorate("clickhouse", clickhouse as never);
  app.decorate("stripe", stripe);
  app.decorate("analyticsQueue", analyticsQueue as never);

  app.addHook("onClose", async () => {
    await analyticsQueue.close();
    await redis.quit();
    await prisma?.$disconnect();
  });
});

async function buildPrismaClient(app: FastifyInstance) {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    app.log.info("Connected to PostgreSQL");
    return prisma;
  } catch (error) {
    app.log.warn({ error }, "PostgreSQL unavailable, running with demo fallbacks");
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

async function buildRedisClient(app: FastifyInstance, redisUrl: string): Promise<Redis | MemoryRedisLike> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true
  });

  try {
    await redis.connect();
    await redis.ping();
    app.log.info("Connected to Redis");
    return redis;
  } catch (error) {
    app.log.warn({ error }, "Redis unavailable, using in-memory counters");
    redis.disconnect();
    return createMemoryRedis();
  }
}

async function buildClickHouseClient(app: FastifyInstance, env: ReturnType<typeof getEnvConfig>) {
  try {
    const clickhouse = new ClickHouse({
      url: env.CLICKHOUSE_URL,
      config: {
        database: env.CLICKHOUSE_DATABASE,
        basicAuth: {
          username: env.CLICKHOUSE_USERNAME,
          password: env.CLICKHOUSE_PASSWORD
        }
      }
    });

    await fetch(env.CLICKHOUSE_URL, { method: "HEAD" });
    app.log.info("Connected to ClickHouse");
    return clickhouse;
  } catch (error) {
    app.log.warn({ error }, "ClickHouse unavailable, analytics writes will stay queued in memory");
    return null;
  }
}

async function buildAnalyticsQueue(
  app: FastifyInstance,
  redis: Redis | MemoryRedisLike
): Promise<Queue | MemoryQueueLike> {
  if ("connect" in redis) {
    try {
      return new Queue("analytics-log-write", {
        connection: redis
      });
    } catch (error) {
      app.log.warn({ error }, "BullMQ unavailable, using in-memory analytics queue");
    }
  }

  return {
    async add(name: string, payload: unknown, options?: unknown) {
      app.log.info({ name, payload, options }, "Analytics job stored in memory");
      return { name, payload, options };
    },
    async close() {
      return;
    }
  };
}

function createMemoryRedis(): MemoryRedisLike {
  const store = new Map<string, string>();

  return {
    async mget(...keys: string[]) {
      return keys.map((key) => store.get(key) ?? null);
    },
    multi() {
      const ops: Array<() => void> = [];

      return {
        incrby(key, value) {
          ops.push(() => {
            const next = Number(store.get(key) ?? 0) + value;
            store.set(key, String(next));
          });
        },
        expire() {
          return;
        },
        incrbyfloat(key, value) {
          ops.push(() => {
            const next = Number(store.get(key) ?? 0) + value;
            store.set(key, String(next));
          });
        },
        incr(key) {
          ops.push(() => {
            const next = Number(store.get(key) ?? 0) + 1;
            store.set(key, String(next));
          });
        },
        set(key, value) {
          ops.push(() => {
            store.set(key, String(value));
          });
        },
        async exec() {
          ops.forEach((op) => op());
          return [];
        }
      };
    },
    async quit() {
      return;
    }
  };
}

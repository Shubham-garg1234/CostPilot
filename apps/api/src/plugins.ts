import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { Redis as UpstashRedis } from "@upstash/redis";
import { Redis as IORedis } from "ioredis";
import Stripe from "stripe";
import type { FastifyInstance } from "fastify";
import { getEnvConfig } from "./config.js";
import { createClickHouseClient } from "./services/clickhouse-service.js";
import type { DependencyState, MemoryRedisLike, UpstashRedisLike } from "./types.js";

type RedisClient = IORedis;

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
  const dependencyStates: DependencyState[] = [];
  const prisma = await buildPrismaClient(app, dependencyStates);
  const redis = await buildRedisClient(
    app,
    {
      redisUrl: env.REDIS_URL,
      upstashUrl: env.UPSTASH_REDIS_REST_URL,
      upstashToken: env.UPSTASH_REDIS_REST_TOKEN
    },
    env.REDIS_MODE,
    dependencyStates
  );
  const clickhouse = await buildClickHouseClient(app, env, dependencyStates);
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  app.decorate("prisma", prisma as never);
  app.decorate("redis", redis as never);
  app.decorate("clickhouse", clickhouse as never);
  app.decorate("stripe", stripe);
  app.decorate("dependencyStates", dependencyStates);
  app.decorate("isReadyForTraffic", () => dependencyStates.every((state) => state.available || state.mode === "optional"));

  logDependencySummary(app, dependencyStates);

  if (!app.isReadyForTraffic()) {
    throw new Error("Required infrastructure dependencies are unavailable.");
  }

  app.addHook("onClose", async () => {
    await redis.quit();
    await prisma?.$disconnect();
  });
});

async function buildPrismaClient(app: FastifyInstance, states: DependencyState[]) {
  const env = getEnvConfig();
  const prisma = new PrismaClient();
  const state: DependencyState = {
    name: "postgres",
    mode: env.POSTGRES_MODE,
    configured: Boolean(env.DATABASE_URL),
    available: false,
    target: formatDatabaseTarget(env.DATABASE_URL)
  };

  try {
    await prisma.$connect();
    app.log.info("Connected to PostgreSQL");
    state.available = true;
    states.push(state);
    return prisma;
  } catch (error) {
    const prismaError = error as { code?: string; message?: string; name?: string; stack?: string };
    app.log.error(
      {
        code: prismaError.code,
        name: prismaError.name,
        message: prismaError.message,
        stack: prismaError.stack,
        databaseTarget: formatDatabaseTarget(env.DATABASE_URL)
      },
      "PostgreSQL connection failed"
    );
    state.detail = prismaError.message ?? "Connection failed";
    states.push(state);
    await prisma.$disconnect().catch(() => undefined);
    if (env.POSTGRES_MODE === "required") {
      throw error;
    }

    app.log.warn("PostgreSQL unavailable, running with local fallbacks");
    return null;
  }
}

function formatDatabaseTarget(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "invalid DATABASE_URL";
  }
}

async function buildRedisClient(
  app: FastifyInstance,
  options: {
    redisUrl?: string;
    upstashUrl?: string;
    upstashToken?: string;
  },
  mode: "required" | "optional",
  states: DependencyState[]
): Promise<RedisClient | MemoryRedisLike | UpstashRedisLike> {
  const hasUpstash = Boolean(options.upstashUrl && options.upstashToken);
  const target = hasUpstash ? options.upstashUrl! : options.redisUrl ?? "";
  const state: DependencyState = {
    name: "redis",
    mode,
    configured: Boolean(target),
    available: false,
    target: formatRedisTarget(target)
  };

  if (hasUpstash) {
    const upstashClient = new UpstashRedis({
      url: options.upstashUrl!,
      token: options.upstashToken!
    });

    try {
      await upstashClient.ping();
      state.available = true;
      states.push(state);
      app.log.info({ target: state.target, mode: "upstash-rest" }, "Connected to Redis");
      return createUpstashRedisAdapter(upstashClient);
    } catch (error) {
      state.detail = error instanceof Error ? error.message : "Connection failed";
      states.push(state);
      app.log.warn({ error, target: state.target }, "Redis unavailable");
      if (mode === "required") {
        throw error;
      }
      return createMemoryRedis();
    }
  }

  const redis = new IORedis(options.redisUrl ?? "", {
    maxRetriesPerRequest: null,
    lazyConnect: true
  });

  try {
    await redis.connect();
    await redis.ping();
    state.available = true;
    states.push(state);
    app.log.info(
      { target: state.target, tls: (options.redisUrl ?? "").startsWith("rediss://"), mode: "tcp" },
      "Connected to Redis"
    );
    return redis;
  } catch (error) {
    state.detail = error instanceof Error ? error.message : "Connection failed";
    states.push(state);
    app.log.warn({ error, target: state.target }, "Redis unavailable");
    redis.disconnect();
    if (mode === "required") {
      throw error;
    }

    return createMemoryRedis();
  }
}

async function buildClickHouseClient(
  app: FastifyInstance,
  env: ReturnType<typeof getEnvConfig>,
  states: DependencyState[]
) {
  const state: DependencyState = {
    name: "clickhouse",
    mode: env.CLICKHOUSE_MODE,
    configured: Boolean(env.CLICKHOUSE_URL),
    available: false,
    target: formatHttpTarget(env.CLICKHOUSE_URL)
  };

  try {
    const clickhouse = await createClickHouseClient(env, app);
    await clickhouse.ping();
    await clickhouse.ensureSchema();
    state.available = true;
    states.push(state);
    app.log.info("Connected to ClickHouse");
    return clickhouse;
  } catch (error) {
    state.detail = error instanceof Error ? error.message : "Connection failed";
    states.push(state);
    app.log.warn({ error, target: state.target }, "ClickHouse unavailable");
    if (env.CLICKHOUSE_MODE === "required") {
      throw error;
    }

    return null;
  }
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

function createUpstashRedisAdapter(client: UpstashRedis): UpstashRedisLike {
  return {
    async mget(...keys: string[]) {
      return await client.mget<string[]>(...keys);
    },
    multi() {
      const pipeline = client.pipeline();
      return {
        incrby(key, value) {
          pipeline.incrby(key, value);
          return this;
        },
        expire(key, seconds) {
          pipeline.expire(key, seconds);
          return this;
        },
        incrbyfloat(key, value) {
          pipeline.incrbyfloat(key, value);
          return this;
        },
        incr(key) {
          pipeline.incr(key);
          return this;
        },
        set(key, value, mode, seconds) {
          if (mode === "EX") {
            pipeline.set(key, value, { ex: seconds });
            return this;
          }
          pipeline.set(key, value);
          return this;
        },
        async exec() {
          return await pipeline.exec();
        }
      };
    },
    async quit() {
      return;
    }
  };
}

function logDependencySummary(app: FastifyInstance, states: DependencyState[]) {
  app.log.info(
    {
      dependencies: states.map((state) => ({
        name: state.name,
        mode: state.mode,
        available: state.available,
        configured: state.configured,
        target: state.target,
        detail: state.detail
      }))
    },
    "Dependency readiness summary"
  );
}

function formatRedisTarget(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "6379")}`;
  } catch {
    return "invalid redis target";
  }
}

function formatHttpTarget(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return "invalid URL";
  }
}

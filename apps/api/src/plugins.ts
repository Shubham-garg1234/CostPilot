import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { Redis as UpstashRedis } from "@upstash/redis";
import { Redis as IORedis } from "ioredis";
import Stripe from "stripe";
import type { FastifyInstance } from "fastify";
import { getEnvConfig } from "./config.js";
import { createDb, type Db } from "./db/client.js";
import { createClickHouseClient } from "./services/clickhouse-service.js";
import type { DependencyState, MemoryRedisLike, UpstashRedisLike } from "./types.js";

type RedisClient = IORedis;

/** Browsers send Origin as either localhost or 127.0.0.1; env often lists only one, which breaks CORS for the other. */
function expandLocalDevOrigins(origin: string): string[] {
  const trimmed = origin.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  variants.add(trimmed.replace("://localhost:", "://127.0.0.1:"));
  variants.add(trimmed.replace("://127.0.0.1:", "://localhost:"));
  return [...variants];
}

function collectCorsOrigins(env: ReturnType<typeof getEnvConfig>): string[] {
  const seeds = [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_API_URL].filter((o): o is string => Boolean(o?.trim()));
  const out = new Set<string>();
  for (const seed of seeds) {
    for (const origin of expandLocalDevOrigins(seed)) {
      out.add(origin);
    }
  }
  return [...out];
}

export async function registerPlugins(app: FastifyInstance) {
  const env = getEnvConfig();
  const allowedOrigins = collectCorsOrigins(env);

  await app.register(cors, {
    origin: allowedOrigins.length === 0 ? true : allowedOrigins,
    credentials: true
  });
  await app.register(infraPlugin);
}

const infraPlugin = fp(async (app) => {
  const env = getEnvConfig();
  const dependencyStates: DependencyState[] = [];
  const db = await buildPostgresClient(app, dependencyStates);
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

  app.decorate("db", db as never);
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
    await db?.end();
  });
});

async function buildPostgresClient(app: FastifyInstance, states: DependencyState[]): Promise<Db | null> {
  const env = getEnvConfig();
  const state: DependencyState = {
    name: "postgres",
    mode: env.POSTGRES_MODE,
    configured: Boolean(env.DATABASE_URL),
    available: false,
    target: formatDatabaseTarget(env.DATABASE_URL)
  };

  if (!env.DATABASE_URL) {
    states.push(state);
    if (env.POSTGRES_MODE === "required") {
      throw new Error("DATABASE_URL is required.");
    }
    app.log.warn("PostgreSQL unavailable, running with local fallbacks");
    return null;
  }

  const db = createDb(env.DATABASE_URL);

  try {
    await db.connect();
    app.log.info("Connected to PostgreSQL");
    state.available = true;
    states.push(state);
    return db;
  } catch (error) {
    const pgError = error as { code?: string; message?: string; name?: string; stack?: string };
    app.log.error(
      {
        code: pgError.code,
        name: pgError.name,
        message: pgError.message,
        stack: pgError.stack,
        databaseTarget: formatDatabaseTarget(env.DATABASE_URL)
      },
      "PostgreSQL connection failed"
    );
    state.detail = pgError.message ?? "Connection failed";
    states.push(state);
    await db.end().catch(() => undefined);
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
      state.fallback = "in-memory";
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

    state.fallback = "in-memory";
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

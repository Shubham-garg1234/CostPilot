import type { Queue } from "bullmq";
import type { ClickHouse } from "clickhouse";
import type Redis from "ioredis";
import type Stripe from "stripe";
import type { PrismaClient, RoleKey } from "@prisma/client";

export type AuthContext = {
  userId: string;
  orgId: string;
  role: RoleKey;
  authMode: "demo" | "clerk";
  teamId?: string | null;
  email?: string;
  name?: string;
};

export type LlmProxyRequest = {
  prompt: string;
  model: string;
  category: string;
  feature?: string;
  metadata?: Record<string, unknown>;
  provider?: "openai" | "anthropic" | "gemini";
};

export type UsageSnapshot = {
  tokensUsedToday: number;
  requestsThisHour: number;
  costThisMonthUsd: number;
  cooldownUntil?: number | null;
  violationCount: number;
};

export type PolicyDecision =
  | { allowed: true; action: "allow" | "warn" | "throttle"; warning?: string; throttleMs?: number }
  | { allowed: false; action: "block"; reason: string };

export type LlmProviderRequest = {
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type LlmProviderResponse = {
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
};

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient | null;
    redis: Redis | MemoryRedisLike;
    clickhouse: ClickHouse | null;
    stripe: Stripe;
    analyticsQueue: Queue | MemoryQueueLike;
  }

  interface FastifyRequest {
    auth: AuthContext;
  }
}

export type MemoryRedisLike = {
  mget(...keys: string[]): Promise<Array<string | null>>;
  multi(): {
    incrby(key: string, value: number): unknown;
    expire(key: string, seconds: number): unknown;
    incrbyfloat(key: string, value: number): unknown;
    incr(key: string): unknown;
    set(key: string, value: string | number, mode: "EX", seconds: number): unknown;
    exec(): Promise<unknown[]>;
  };
  quit(): Promise<void>;
};

export type MemoryQueueLike = {
  add(name: string, payload: unknown, options?: unknown): Promise<{ name: string; payload: unknown; options?: unknown }>;
  close(): Promise<void>;
};

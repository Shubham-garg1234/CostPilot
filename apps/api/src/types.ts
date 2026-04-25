import type Redis from "ioredis";
import type Stripe from "stripe";
import type { IntegrationType, PrismaClient, RoleKey, UsageSource } from "@prisma/client";

export type AuthContext = {
  userId: string;
  orgId: string;
  role: RoleKey;
  authMode: "clerk" | "employee";
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
  source?:
    | "sdk"
    | "cursor"
    | "chrome_extension"
    | "copilot"
    | "claude"
    | "codex"
    | "mcp"
    | "other";
  integrationType?: "proxy" | "mcp" | "extension" | "direct" | "import" | "observability";
  workspaceId?: string;
  sessionId?: string;
  requestId?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
};

export type UsageEventInput = {
  auth: AuthContext;
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  category: string;
  feature?: string;
  source: UsageSource;
  integrationType: IntegrationType;
  workspaceId?: string;
  sessionId?: string;
  requestId?: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
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

export type DependencyMode = "required" | "optional";

export type DependencyState = {
  name: "postgres" | "redis" | "clickhouse";
  mode: DependencyMode;
  configured: boolean;
  available: boolean;
  target: string;
  detail?: string;
};

export type AnalyticsWriteResult = {
  persisted: boolean;
  status: "written" | "skipped";
  detail?: string;
};

export type UpstashRedisLike = {
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

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient | null;
    redis: Redis | MemoryRedisLike | UpstashRedisLike;
    clickhouse: ClickHouseClientLike | null;
    stripe: Stripe;
    dependencyStates: DependencyState[];
    isReadyForTraffic(): boolean;
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

export type ClickHouseClientLike = {
  ping(): Promise<void>;
  ensureSchema(): Promise<void>;
  insertUsageEvent(payload: UsageEventInput): Promise<void>;
};

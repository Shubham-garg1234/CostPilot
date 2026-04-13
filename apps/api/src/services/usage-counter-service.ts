import dayjs from "dayjs";
import type { FastifyInstance } from "fastify";
import type { AuthContext, UsageSnapshot } from "../types.js";

function keys(auth: AuthContext, category: string, feature?: string) {
  const featureKey = feature ?? "all";
  const day = dayjs().format("YYYY-MM-DD");
  const hour = dayjs().format("YYYY-MM-DD-HH");
  const month = dayjs().format("YYYY-MM");

  return {
    tokens: `user:${auth.userId}:tokens:daily:${day}`,
    requests: `user:${auth.userId}:requests:hourly:${hour}`,
    cost: `user:${auth.userId}:cost:monthly:${month}`,
    scopedTokens: `usage:${auth.orgId}:${auth.userId}:${category}:${featureKey}:tokens:${day}`,
    scopedRequests: `usage:${auth.orgId}:${auth.userId}:${category}:${featureKey}:requests:${hour}`,
    scopedCost: `usage:${auth.orgId}:${auth.userId}:${category}:${featureKey}:cost:${month}`,
    cooldown: `usage:${auth.orgId}:${auth.userId}:${category}:${featureKey}:cooldown`,
    violations: `usage:${auth.orgId}:${auth.userId}:violations:${day}`
  };
}

export async function getUsageSnapshot(
  app: FastifyInstance,
  auth: AuthContext,
  category: string,
  feature?: string
): Promise<UsageSnapshot> {
  const redisKeys = keys(auth, category, feature);
  const [tokens, requests, cost, cooldownUntil, violations] = await app.redis.mget(
    redisKeys.tokens,
    redisKeys.requests,
    redisKeys.cost,
    redisKeys.cooldown,
    redisKeys.violations
  );

  return {
    tokensUsedToday: Number(tokens ?? 0),
    requestsThisHour: Number(requests ?? 0),
    costThisMonthUsd: Number(cost ?? 0),
    cooldownUntil: cooldownUntil ? Number(cooldownUntil) : null,
    violationCount: Number(violations ?? 0)
  };
}

export async function commitUsage(
  app: FastifyInstance,
  auth: AuthContext,
  category: string,
  feature: string | undefined,
  totalTokens: number,
  totalCostUsd: number
) {
  const redisKeys = keys(auth, category, feature);
  const tokenExpiry = dayjs().endOf("day").diff(dayjs(), "second");
  const requestExpiry = dayjs().endOf("hour").diff(dayjs(), "second");
  const costExpiry = dayjs().endOf("month").diff(dayjs(), "second");

  const multi = app.redis.multi();
  multi.incrby(redisKeys.tokens, totalTokens);
  multi.expire(redisKeys.tokens, tokenExpiry);
  multi.incrby(redisKeys.scopedTokens, totalTokens);
  multi.expire(redisKeys.scopedTokens, tokenExpiry);
  multi.incrby(redisKeys.requests, 1);
  multi.expire(redisKeys.requests, requestExpiry);
  multi.incrby(redisKeys.scopedRequests, 1);
  multi.expire(redisKeys.scopedRequests, requestExpiry);
  multi.incrbyfloat(redisKeys.cost, totalCostUsd);
  multi.expire(redisKeys.cost, costExpiry);
  multi.incrbyfloat(redisKeys.scopedCost, totalCostUsd);
  multi.expire(redisKeys.scopedCost, costExpiry);
  await multi.exec();
}

export async function registerViolation(
  app: FastifyInstance,
  auth: AuthContext,
  category: string,
  feature: string | undefined,
  cooldownMinutes: number
) {
  const redisKeys = keys(auth, category, feature);
  const multi = app.redis.multi();
  multi.incr(redisKeys.violations);
  multi.expire(redisKeys.violations, dayjs().endOf("day").diff(dayjs(), "second"));

  if (cooldownMinutes > 0) {
    const cooldownUntil = Date.now() + cooldownMinutes * 60_000;
    multi.set(redisKeys.cooldown, cooldownUntil, "EX", cooldownMinutes * 60);
  }

  await multi.exec();
}

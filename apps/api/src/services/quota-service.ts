import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { createId } from "../db/id.js";
import { findUserWithOrganization, listOrganizationHeads } from "../db/index.js";
import { ViolationAction, ViolationType } from "../db/types.js";
import type { AuthContext, LlmProxyRequest } from "../types.js";
import { calculateCost } from "./costing.js";
import { sendDailyTokenQuotaExhaustedEmails } from "./mailer-service.js";
import { createPolicyViolation, resolvePolicy } from "./policy-engine.js";
import {
  getUsageSnapshot,
  usageCounterExpiries,
  usageCounterKeys
} from "./usage-counter-service.js";

type QuotaRequest = {
  auth: AuthContext;
  category: string;
  feature?: string;
  model: string;
  provider?: "openai" | "anthropic" | "gemini";
  prompt?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
};

type QuotaReservationRecord = {
  id: string;
  orgId: string;
  userId: string;
  category: string;
  feature?: string;
  estimatedTokens: number;
  estimatedCostUsd: number;
};

export type QuotaReservationDecision =
  | {
      allowed: true;
      reservationId: string | null;
      estimatedTokens: number;
      remainingTokensToday: number | null;
      limit: number | null;
    }
  | {
      allowed: false;
      status: "blocked";
      reason: string;
      limit: number;
      used: number;
      reserved: number;
      requested: number;
      remainingTokensToday: number;
    };

export function estimatePromptTokens(prompt: string) {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

export function estimateTotalTokens(input: {
  prompt?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
}) {
  if (input.estimatedTotalTokens !== undefined) {
    return Math.max(0, Math.ceil(input.estimatedTotalTokens));
  }

  const inputTokens = input.estimatedInputTokens ?? estimatePromptTokens(input.prompt ?? "");
  const outputTokens = input.estimatedOutputTokens ?? 2_000;
  return Math.max(0, Math.ceil(inputTokens + outputTokens));
}

export async function reserveDailyTokenQuota(
  app: FastifyInstance,
  input: QuotaRequest
): Promise<QuotaReservationDecision> {
  const request = quotaRequestToPolicyRequest(input);
  const policy = await resolvePolicy(app, input.auth, request);
  const estimatedTokens = estimateTotalTokens(input);
  const estimatedCostUsd =
    input.estimatedCostUsd ??
    calculateCost(input.model, input.estimatedInputTokens ?? estimatePromptTokens(input.prompt ?? ""), input.estimatedOutputTokens ?? 2_000)
      .totalCostUsd;

  if (!policy?.maxTokensPerDay) {
    return {
      allowed: true,
      reservationId: null,
      estimatedTokens,
      remainingTokensToday: null,
      limit: null
    };
  }

  if (policy.featureLocked) {
    return {
      allowed: false,
      status: "blocked",
      reason: "Feature is locked for this role.",
      limit: policy.maxTokensPerDay,
      used: 0,
      reserved: 0,
      requested: estimatedTokens,
      remainingTokensToday: 0
    };
  }

  if (policy.allowedModels.length > 0 && !policy.allowedModels.includes(input.model)) {
    return {
      allowed: false,
      status: "blocked",
      reason: "Selected model is not allowed for this role.",
      limit: policy.maxTokensPerDay,
      used: 0,
      reserved: 0,
      requested: estimatedTokens,
      remainingTokensToday: 0
    };
  }

  const firstSnapshot = await getUsageSnapshot(app, input.auth, input.category, input.feature);
  const firstRemaining = Math.max(
    0,
    policy.maxTokensPerDay - firstSnapshot.tokensUsedToday - firstSnapshot.tokensReservedToday
  );

  if (estimatedTokens > firstRemaining) {
    await recordTokenLimitBlock(app, input, policy.maxTokensPerDay, firstSnapshot, estimatedTokens);
    return {
      allowed: false,
      status: "blocked",
      reason: "Daily token quota exceeded.",
      limit: policy.maxTokensPerDay,
      used: firstSnapshot.tokensUsedToday,
      reserved: firstSnapshot.tokensReservedToday,
      requested: estimatedTokens,
      remainingTokensToday: firstRemaining
    };
  }

  const reservationId = createId();
  await createReservation(app, input, reservationId, estimatedTokens, estimatedCostUsd);

  const secondSnapshot = await getUsageSnapshot(app, input.auth, input.category, input.feature);
  const secondRemaining = Math.max(
    0,
    policy.maxTokensPerDay - secondSnapshot.tokensUsedToday - secondSnapshot.tokensReservedToday
  );

  if (secondSnapshot.tokensUsedToday + secondSnapshot.tokensReservedToday > policy.maxTokensPerDay) {
    await releaseQuotaReservation(app, reservationId);
    await recordTokenLimitBlock(app, input, policy.maxTokensPerDay, secondSnapshot, estimatedTokens);
    return {
      allowed: false,
      status: "blocked",
      reason: "Daily token quota exceeded.",
      limit: policy.maxTokensPerDay,
      used: secondSnapshot.tokensUsedToday,
      reserved: secondSnapshot.tokensReservedToday,
      requested: estimatedTokens,
      remainingTokensToday: secondRemaining
    };
  }

  return {
    allowed: true,
    reservationId,
    estimatedTokens,
    remainingTokensToday: secondRemaining,
    limit: policy.maxTokensPerDay
  };
}

export async function releaseQuotaReservation(app: FastifyInstance, reservationId?: string | null) {
  if (!reservationId) {
    return;
  }

  const reservationKey = quotaReservationKey(reservationId);
  const raw = await app.redis.get(reservationKey).catch(() => null);
  if (!raw) {
    return;
  }

  const record = safeParseReservation(raw);
  if (!record) {
    return;
  }

  const auth: AuthContext = {
    userId: record.userId,
    orgId: record.orgId,
    role: "SDE1",
    authMode: "employee"
  };
  const keys = usageCounterKeys(auth, record.category, record.feature);
  const multi = app.redis.multi();
  multi.decrby(keys.tokenReservations, record.estimatedTokens);
  multi.incrbyfloat(keys.costReservations, -record.estimatedCostUsd);
  multi.del(reservationKey);
  await multi.exec();
}

export async function notifyIfDailyTokenLimitReached(app: FastifyInstance, input: QuotaRequest) {
  const request = quotaRequestToPolicyRequest(input);
  const policy = await resolvePolicy(app, input.auth, request);
  if (!policy?.maxTokensPerDay) {
    return;
  }

  const snapshot = await getUsageSnapshot(app, input.auth, input.category, input.feature);
  if (snapshot.tokensUsedToday < policy.maxTokensPerDay) {
    return;
  }

  await sendDailyTokenLimitEmailsOnce(app, input, {
    limit: policy.maxTokensPerDay,
    used: snapshot.tokensUsedToday,
    requested: input.estimatedTotalTokens
  });
}

async function createReservation(
  app: FastifyInstance,
  input: QuotaRequest,
  reservationId: string,
  estimatedTokens: number,
  estimatedCostUsd: number
) {
  const keys = usageCounterKeys(input.auth, input.category, input.feature);
  const expiry = usageCounterExpiries();
  const record: QuotaReservationRecord = {
    id: reservationId,
    orgId: input.auth.orgId,
    userId: input.auth.userId,
    category: input.category,
    feature: input.feature,
    estimatedTokens,
    estimatedCostUsd
  };

  const multi = app.redis.multi();
  multi.incrby(keys.tokenReservations, estimatedTokens);
  multi.expire(keys.tokenReservations, expiry.day);
  multi.incrbyfloat(keys.costReservations, estimatedCostUsd);
  multi.expire(keys.costReservations, expiry.month);
  multi.set(quotaReservationKey(reservationId), JSON.stringify(record), "EX", Math.max(60, expiry.day));
  await multi.exec();
}

async function recordTokenLimitBlock(
  app: FastifyInstance,
  input: QuotaRequest,
  limit: number,
  snapshot: { tokensUsedToday: number; tokensReservedToday: number },
  requested: number
) {
  await createPolicyViolation(
    app,
    input.auth,
    quotaRequestToPolicyRequest(input),
    ViolationAction.BLOCK,
    ViolationType.TOKEN_LIMIT,
    "Daily token quota exceeded.",
    0
  );

  await sendDailyTokenLimitEmailsOnce(app, input, {
    limit,
    used: snapshot.tokensUsedToday,
    requested
  });
}

async function sendDailyTokenLimitEmailsOnce(
  app: FastifyInstance,
  input: QuotaRequest,
  quota: { limit: number; used: number; requested?: number }
) {
  if (!app.db) {
    return;
  }

  const day = dayjs().format("YYYY-MM-DD");
  const notifyKey = `quota:daily-token-email:${input.auth.orgId}:${input.auth.userId}:${input.category}:${input.feature ?? "all"}:${day}`;
  const existing = await app.redis.mget(notifyKey).then((values) => values[0]).catch(() => null);
  if (existing) {
    return;
  }

  const profile = await findUserWithOrganization(app.db, input.auth.userId);
  if (!profile) {
    return;
  }

  const heads = await listOrganizationHeads(app.db, input.auth.orgId);
  const result = await sendDailyTokenQuotaExhaustedEmails({
    employee: {
      email: profile.user.email,
      fullName: profile.user.fullName,
      role: profile.user.role
    },
    organization: {
      name: profile.organization.name
    },
    heads: heads
      .filter((head) => head.email !== profile.user.email)
      .map((head) => ({ email: head.email, fullName: head.fullName })),
    quota: {
      category: input.category,
      feature: input.feature,
      limit: quota.limit,
      used: quota.used,
      requested: quota.requested
    }
  });

  if (!result.delivered) {
    app.log.warn({ reason: result.reason, userId: input.auth.userId }, "Daily token quota email was not delivered");
    return;
  }

  const expiry = usageCounterExpiries();
  const multi = app.redis.multi();
  multi.set(notifyKey, "sent", "EX", Math.max(60, expiry.day));
  await multi.exec();
}

function quotaRequestToPolicyRequest(input: QuotaRequest): LlmProxyRequest {
  return {
    prompt: input.prompt ?? "(quota preflight)",
    model: input.model,
    provider: input.provider,
    category: input.category,
    feature: input.feature,
    metadata: input.metadata
  };
}

function quotaReservationKey(reservationId: string) {
  return `quota:reservation:${reservationId}`;
}

function safeParseReservation(raw: string): QuotaReservationRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<QuotaReservationRecord>;
    if (!value.id || !value.orgId || !value.userId || !value.category || value.estimatedTokens === undefined) {
      return null;
    }

    return {
      id: value.id,
      orgId: value.orgId,
      userId: value.userId,
      category: value.category,
      feature: value.feature,
      estimatedTokens: Number(value.estimatedTokens),
      estimatedCostUsd: Number(value.estimatedCostUsd ?? 0)
    };
  } catch {
    return null;
  }
}

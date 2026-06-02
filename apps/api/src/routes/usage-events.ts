import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { listRecentUsageEvents, summarizeUsageGroupBy, summarizeUsageTotals } from "../db/usage.js";
import { decimalNumber } from "../db/mappers.js";
import type { UsageSource } from "../db/types.js";
import { authenticate } from "../auth.js";
import { calculateCost } from "../services/costing.js";
import { mirrorUsageEventToAnalytics, persistUsageEvent } from "../services/analytics-service.js";
import { recordActivity } from "../services/activity-log-service.js";
import { commitUsage } from "../services/usage-counter-service.js";
import {
  notifyIfDailyTokenLimitReached,
  releaseQuotaReservation,
  reserveDailyTokenQuota
} from "../services/quota-service.js";
import { isCodingAgentTrackingContext, validateStrictCodingAgentUsage } from "../services/strict-usage-tracking.js";
import {
  integrationTypeValues,
  normalizeIntegrationType,
  normalizeUsageSource,
  serializeIntegrationType,
  serializeUsageSource,
  usageSourceValues
} from "../services/usage-source.js";

const trackingContextSchema = z.object({
  source: z.enum(usageSourceValues).optional(),
  integrationType: z.enum(integrationTypeValues).optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional()
});

const quotaPreflightSchema = trackingContextSchema.extend({
  prompt: z.string().optional(),
  model: z.string().min(1),
  category: z.string().min(1),
  feature: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  estimatedInputTokens: z.number().int().nonnegative().optional(),
  estimatedOutputTokens: z.number().int().nonnegative().optional(),
  estimatedTotalTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional()
});

const usageEventSchema = z.object({
  model: z.string().min(1),
  category: z.string().min(1),
  feature: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  source: z.enum(usageSourceValues).default("mcp"),
  integrationType: z.enum(integrationTypeValues).default("mcp"),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  reservationId: z.string().optional(),
  status: z.string().default("success"),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

const summaryQuerySchema = z.object({
  source: z.enum(usageSourceValues).optional(),
  category: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  days: z.coerce.number().int().min(1).max(90).default(30)
});

function buildUsageWhere(orgId: string, options: {
  since: Date;
  userId?: string;
  source?: string;
  category?: string;
  provider?: string;
}) {
  const clauses = [`"orgId" = $1`, `"createdAt" >= $2`];
  const params: unknown[] = [orgId, options.since];
  let index = 3;

  if (options.userId) {
    clauses.push(`"userId" = $${index++}`);
    params.push(options.userId);
  }
  if (options.source) {
    clauses.push(`source = $${index++}`);
    params.push(options.source);
  }
  if (options.category) {
    clauses.push(`category = $${index++}`);
    params.push(options.category);
  }
  if (options.provider) {
    clauses.push(`provider = $${index++}`);
    params.push(options.provider);
  }

  return { sql: clauses.join(" AND "), params };
}

function activityContext(body: z.infer<typeof trackingContextSchema>) {
  return {
    source: body.source ?? "mcp",
    integrationType: body.integrationType ?? "mcp",
    workspaceId: body.workspaceId,
    sessionId: body.sessionId,
    requestId: body.requestId
  };
}

export async function registerUsageEventRoutes(app: FastifyInstance) {
  app.post("/api/usage-events/preflight", { preHandler: [authenticate] }, async (request, reply) => {
    const body = quotaPreflightSchema.parse(request.body);
    const ctx = activityContext(body);

    await recordActivity(app, {
      auth: request.auth,
      eventType: "agent.turn_preflight",
      eventCategory: "agent",
      status: "started",
      ...ctx,
      metadata: {
        model: body.model,
        category: body.category,
        feature: body.feature,
        provider: body.provider,
        ...body.metadata
      }
    });

    const decision = await reserveDailyTokenQuota(app, {
      auth: request.auth,
      category: body.category,
      feature: body.feature,
      model: body.model,
      provider: body.provider,
      prompt: body.prompt,
      estimatedInputTokens: body.estimatedInputTokens,
      estimatedOutputTokens: body.estimatedOutputTokens,
      estimatedTotalTokens: body.estimatedTotalTokens,
      estimatedCostUsd: body.estimatedCostUsd,
      metadata: body.metadata
    });

    if (!decision.allowed) {
      await recordActivity(app, {
        auth: request.auth,
        eventType: "quota.preflight_blocked",
        eventCategory: "quota",
        status: "blocked",
        outcomeReason: decision.reason,
        ...ctx,
        metadata: decision
      });
      await recordActivity(app, {
        auth: request.auth,
        eventType: "agent.turn_blocked",
        eventCategory: "agent",
        status: "blocked",
        outcomeReason: decision.reason,
        ...ctx,
        metadata: decision
      });
      return reply.status(403).send(decision);
    }

    await recordActivity(app, {
      auth: request.auth,
      eventType: "quota.preflight_allowed",
      eventCategory: "quota",
      status: "success",
      ...ctx,
      subjectType: "quota_reservation",
      subjectId: decision.reservationId,
      metadata: decision
    });

    return decision;
  });

  app.post("/api/usage-events", { preHandler: [authenticate] }, async (request, reply) => {
    const rawBody = (request.body ?? {}) as Record<string, unknown>;
    const body = usageEventSchema.parse(request.body);
    const ctx = activityContext(body);
    const source = normalizeUsageSource(body.source);
    const integrationType = normalizeIntegrationType(body.integrationType);
    const serializedSource = serializeUsageSource(source);
    const serializedIntegration = serializeIntegrationType(integrationType);
    const strictContext = isCodingAgentTrackingContext(serializedSource, serializedIntegration);

    const promptTokens = body.promptTokens;
    const completionTokens = body.completionTokens;
    const totalTokens = body.totalTokens ?? promptTokens + completionTokens;
    const costUsd = body.costUsd ?? calculateCost(body.model, promptTokens, completionTokens).totalCostUsd;

    let metadata = body.metadata;

    if (strictContext) {
      const validation = validateStrictCodingAgentUsage({
        rawBody,
        provider: body.provider,
        model: body.model,
        source: serializedSource,
        integrationType: serializedIntegration,
        sessionId: body.sessionId,
        requestId: body.requestId,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        metadata: body.metadata
      });

      if (!validation.ok) {
        await recordActivity(app, {
          auth: request.auth,
          eventType: "usage.tracking_blocked",
          eventCategory: "usage",
          status: "blocked",
          outcomeReason: validation.reason,
          source: serializedSource,
          integrationType: serializedIntegration,
          workspaceId: body.workspaceId,
          sessionId: body.sessionId,
          requestId: body.requestId,
          metadata: {
            missing: validation.missing,
            model: body.model,
            provider: body.provider,
            category: body.category,
            rawBody
          }
        });
        return reply.status(422).send({
          message: validation.reason,
          missing: validation.missing,
          strict: true
        });
      }

      metadata = validation.agentMetadata;
    }

    await recordActivity(app, {
      auth: request.auth,
      eventType: "agent.turn_completed",
      eventCategory: "agent",
      status: body.status === "success" ? "success" : "failed",
      source: serializedSource,
      integrationType: serializedIntegration,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      requestId: body.requestId,
      metadata: {
        model: body.model,
        provider: body.provider,
        category: body.category,
        strict: strictContext
      }
    });

    const usagePayload = {
      auth: request.auth,
      provider: body.provider,
      model: body.model,
      category: body.category,
      feature: body.feature,
      source,
      integrationType,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      requestId: body.requestId,
      status: body.status,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      metadata,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      completedAt: body.completedAt ? new Date(body.completedAt) : undefined
    };

    const usageEvent = await persistUsageEvent(app, usagePayload);
    const analyticsWrite = usageEvent
      ? await mirrorUsageEventToAnalytics(app, usagePayload)
      : { persisted: false, status: "skipped" as const, detail: "Duplicate usage event." };

    if (usageEvent) {
      await recordActivity(app, {
        auth: request.auth,
        eventType: "usage.event_recorded",
        eventCategory: "usage",
        status: "success",
        source: serializedSource,
        integrationType: serializedIntegration,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        subjectType: "usage_event",
        subjectId: usageEvent.id,
        metadata: {
          promptTokens,
          completionTokens,
          totalTokens,
          costUsd,
          exact: strictContext
        }
      });

      await commitUsage(app, request.auth, body.category, body.feature, totalTokens, costUsd);
      await releaseQuotaReservation(app, body.reservationId);
      await notifyIfDailyTokenLimitReached(app, {
        auth: request.auth,
        category: body.category,
        feature: body.feature,
        model: body.model,
        provider: body.provider,
        estimatedTotalTokens: totalTokens,
        estimatedCostUsd: costUsd,
        metadata
      });
    } else {
      await recordActivity(app, {
        auth: request.auth,
        eventType: "usage.event_duplicate",
        eventCategory: "usage",
        status: "success",
        source: serializedSource,
        integrationType: serializedIntegration,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        metadata: { requestId: body.requestId }
      });
    }

    return reply.status(201).send({
      status: usageEvent ? "recorded" : "duplicate",
      usageEventId: usageEvent?.id,
      strict: strictContext,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: Number(costUsd.toFixed(6)),
        recorded: Boolean(usageEvent),
        source: serializedSource,
        integrationType: serializedIntegration
      },
      analyticsStatus: analyticsWrite.status,
      analyticsDetail: analyticsWrite.detail
    });
  });

  app.get("/api/usage-events/summary", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const query = summaryQuerySchema.parse(request.query);
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const { sql, params } = buildUsageWhere(request.auth.orgId, {
      since,
      userId: request.auth.authMode === "employee" ? request.auth.userId : undefined,
      source: query.source ? normalizeUsageSource(query.source) : undefined,
      category: query.category,
      provider: query.provider
    });

    const [totals, bySource, byCategory, byProvider] = await Promise.all([
      summarizeUsageTotals(app.db, sql, params),
      summarizeUsageGroupBy(app.db, "source", sql, params),
      summarizeUsageGroupBy(app.db, "category", sql, params),
      summarizeUsageGroupBy(app.db, "provider", sql, params)
    ]);

    return {
      rangeDays: query.days,
      totals,
      bySource: bySource.map((row) => ({
        source: serializeUsageSource(row.key as UsageSource),
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        requestCount: row.requestCount
      })),
      byCategory: byCategory.map((row) => ({
        category: row.key,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        requestCount: row.requestCount
      })),
      byProvider: byProvider.map((row) => ({
        provider: row.key,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        requestCount: row.requestCount
      }))
    };
  });

  app.get("/api/usage-events/recent", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const events = await listRecentUsageEvents(app.db, request.auth.orgId, 20);

    return {
      events: events.map((event) => ({
        ...event,
        source: serializeUsageSource(event.source),
        integrationType: serializeIntegrationType(event.integrationType),
        costUsd: decimalNumber(event.costUsd)
      }))
    };
  });
}

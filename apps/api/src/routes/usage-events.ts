import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { listRecentUsageEvents, summarizeUsageGroupBy, summarizeUsageTotals } from "../db/usage.js";
import { decimalNumber } from "../db/mappers.js";
import type { UsageSource } from "../db/types.js";
import { authenticate } from "../auth.js";
import { calculateCost } from "../services/costing.js";
import { mirrorUsageEventToAnalytics, persistUsageEvent } from "../services/analytics-service.js";
import { commitUsage } from "../services/usage-counter-service.js";
import {
  integrationTypeValues,
  normalizeIntegrationType,
  normalizeUsageSource,
  serializeIntegrationType,
  serializeUsageSource,
  usageSourceValues
} from "../services/usage-source.js";

const usageEventSchema = z.object({
  model: z.string().min(1),
  category: z.string().min(1),
  feature: z.string().optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  source: z.enum(usageSourceValues).default("sdk"),
  integrationType: z.enum(integrationTypeValues).default("direct"),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
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

export async function registerUsageEventRoutes(app: FastifyInstance) {
  app.post("/api/usage-events", { preHandler: [authenticate] }, async (request, reply) => {
    const body = usageEventSchema.parse(request.body);
    const promptTokens = body.promptTokens;
    const completionTokens = body.completionTokens;
    const totalTokens = body.totalTokens ?? promptTokens + completionTokens;
    const costUsd = body.costUsd ?? calculateCost(body.model, promptTokens, completionTokens).totalCostUsd;
    const source = normalizeUsageSource(body.source);
    const integrationType = normalizeIntegrationType(body.integrationType);

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
      metadata: body.metadata,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      completedAt: body.completedAt ? new Date(body.completedAt) : undefined
    };
    const usageEvent = await persistUsageEvent(app, usagePayload);
    const analyticsWrite = usageEvent
      ? await mirrorUsageEventToAnalytics(app, usagePayload)
      : { persisted: false, status: "skipped" as const, detail: "Duplicate usage event." };

    if (usageEvent) {
      await commitUsage(app, request.auth, body.category, body.feature, totalTokens, costUsd);
    }

    return reply.status(201).send({
      status: usageEvent ? "recorded" : "duplicate",
      usageEventId: usageEvent?.id,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: Number(costUsd.toFixed(6)),
        recorded: Boolean(usageEvent),
        source: body.source,
        integrationType: body.integrationType
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

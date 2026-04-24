import { z } from "zod";
import type { FastifyInstance } from "fastify";
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
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const query = summaryQuerySchema.parse(request.query);
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const where = {
      orgId: request.auth.orgId,
      createdAt: { gte: since },
      ...(query.source ? { source: normalizeUsageSource(query.source) } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.provider ? { provider: query.provider } : {})
    };

    const [totals, bySource, byCategory, byProvider] = await Promise.all([
      app.prisma.usageEvent.aggregate({
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { _all: true }
      }),
      app.prisma.usageEvent.groupBy({
        by: ["source"],
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } }
      }),
      app.prisma.usageEvent.groupBy({
        by: ["category"],
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } }
      }),
      app.prisma.usageEvent.groupBy({
        by: ["provider"],
        where,
        _sum: { totalTokens: true, costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } }
      })
    ]);

    return {
      rangeDays: query.days,
      totals: {
        totalTokens: totals._sum.totalTokens ?? 0,
        costUsd: Number(totals._sum.costUsd ?? 0),
        requestCount: totals._count._all
      },
      bySource: bySource.map((row) => ({
        source: serializeUsageSource(row.source),
        totalTokens: row._sum.totalTokens ?? 0,
        costUsd: Number(row._sum.costUsd ?? 0),
        requestCount: row._count._all
      })),
      byCategory: byCategory.map((row) => ({
        category: row.category,
        totalTokens: row._sum.totalTokens ?? 0,
        costUsd: Number(row._sum.costUsd ?? 0),
        requestCount: row._count._all
      })),
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        totalTokens: row._sum.totalTokens ?? 0,
        costUsd: Number(row._sum.costUsd ?? 0),
        requestCount: row._count._all
      }))
    };
  });

  app.get("/api/usage-events/recent", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const events = await app.prisma.usageEvent.findMany({
      where: { orgId: request.auth.orgId },
      take: 20,
      orderBy: { createdAt: "desc" }
    });

    return {
      events: events.map((event) => ({
        ...event,
        source: serializeUsageSource(event.source),
        integrationType: serializeIntegrationType(event.integrationType),
        costUsd: Number(event.costUsd)
      }))
    };
  });
}

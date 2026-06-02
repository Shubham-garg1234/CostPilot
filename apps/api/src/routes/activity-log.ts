import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import {
  listActivityLogs,
  listAgentEvents,
  listPolicies,
  listPromptEnhancementEvents,
  listQuotaDecisionEvents,
  listRecentUsageEvents,
  listToolFailureEvents,
  summarizeActivityLogs,
  summarizeAgentSessions
} from "../db/index.js";
import { decimalNumber } from "../db/mappers.js";
import type { UsageSource } from "../db/types.js";
import { recordActivity } from "../services/activity-log-service.js";
import { serializeIntegrationType, serializeUsageSource } from "../services/usage-source.js";

const activityQuerySchema = z.object({
  eventType: z.string().optional(),
  eventCategory: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

const recordActivitySchema = z.object({
  eventType: z.string().min(1),
  eventCategory: z.string().min(1),
  status: z.string().min(1),
  outcomeReason: z.string().optional(),
  source: z.string().optional(),
  integrationType: z.string().optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const adminInsightsQuerySchema = activityQuerySchema.extend({
  dataset: z.enum([
    "agent_events",
    "usage_events",
    "users",
    "sessions",
    "policies",
    "quota_decisions",
    "prompt_enhancements",
    "tool_failures"
  ])
});

export async function registerActivityLogRoutes(app: FastifyInstance) {
  app.post("/api/activity-log/events", { preHandler: [authenticate] }, async (request, reply) => {
    const body = recordActivitySchema.parse(request.body);
    const row = await recordActivity(app, {
      auth: request.auth,
      eventType: body.eventType,
      eventCategory: body.eventCategory,
      status: body.status,
      outcomeReason: body.outcomeReason,
      source: body.source,
      integrationType: body.integrationType,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId,
      requestId: body.requestId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      metadata: body.metadata
    });

    if (!row) {
      return reply.status(503).send({ message: "Activity log is unavailable." });
    }

    return reply.status(201).send({ id: row.id, eventType: row.eventType, status: row.status });
  });

  app.get("/api/activity-log/recent", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const query = activityQuerySchema.parse(request.query);
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const events = await listActivityLogs(app.db, {
      orgId: request.auth.orgId,
      userId: request.auth.authMode === "employee" ? request.auth.userId : undefined,
      eventType: query.eventType,
      eventCategory: query.eventCategory,
      status: query.status,
      source: query.source,
      sessionId: query.sessionId,
      requestId: query.requestId,
      since,
      limit: query.limit
    });

    return {
      dataset: "activity_log",
      rangeDays: query.days,
      events
    };
  });

  app.get("/api/activity-log/summary", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const query = activityQuerySchema.parse(request.query);
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const summary = await summarizeActivityLogs(app.db, request.auth.orgId, since);

    return {
      rangeDays: query.days,
      ...summary
    };
  });

  app.get("/api/admin-insights", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const query = adminInsightsQuerySchema.parse(request.query);
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const baseFilters = {
      orgId: request.auth.orgId,
      userId: request.auth.authMode === "employee" ? request.auth.userId : undefined,
      status: query.status,
      source: query.source,
      sessionId: query.sessionId,
      requestId: query.requestId,
      since,
      limit: query.limit
    };

    switch (query.dataset) {
      case "agent_events":
        return {
          dataset: query.dataset,
          rows: await listAgentEvents(app.db, baseFilters)
        };
      case "usage_events": {
        const events = await listRecentUsageEvents(app.db, request.auth.orgId, query.limit);
        return {
          dataset: query.dataset,
          rows: events
            .filter((event) => request.auth.authMode !== "employee" || event.userId === request.auth.userId)
            .map((event) => ({
              ...event,
              source: serializeUsageSource(event.source as UsageSource),
              integrationType: serializeIntegrationType(event.integrationType),
              costUsd: decimalNumber(event.costUsd)
            }))
        };
      }
      case "users":
        return {
          dataset: query.dataset,
          rows: await listUserInsights(app, request.auth.orgId, request.auth.authMode === "employee" ? request.auth.userId : undefined)
        };
      case "sessions":
        return {
          dataset: query.dataset,
          rows: await summarizeAgentSessions(app.db, request.auth.orgId, since, query.limit)
        };
      case "policies":
        return {
          dataset: query.dataset,
          rows: await listPolicies(app.db, {
            orgId: request.auth.orgId,
            ...(request.auth.authMode === "employee" ? { role: request.auth.role } : {})
          })
        };
      case "quota_decisions":
        return {
          dataset: query.dataset,
          rows: await listQuotaDecisionEvents(app.db, baseFilters)
        };
      case "prompt_enhancements":
        return {
          dataset: query.dataset,
          rows: await listPromptEnhancementEvents(app.db, baseFilters)
        };
      case "tool_failures":
        return {
          dataset: query.dataset,
          rows: await listToolFailureEvents(app.db, baseFilters)
        };
    }
  });
}

async function listUserInsights(app: FastifyInstance, orgId: string, userId?: string) {
  const clauses = [`u."organizationId" = $1`];
  const params: unknown[] = [orgId];

  if (userId) {
    clauses.push(`u."id" = $2`);
    params.push(userId);
  }

  const result = await app.db!.query(
    `
      SELECT
        u."id",
        u."email",
        u."fullName",
        u."role",
        u."teamId",
        u."createdAt",
        COALESCE(SUM(ue."totalTokens"), 0)::int AS "totalTokens",
        COALESCE(SUM(ue."costUsd"), 0)::float AS "costUsd",
        COUNT(ue."id")::int AS "usageEvents",
        MAX(ue."createdAt") AS "lastUsageAt"
      FROM "User" u
      LEFT JOIN "UsageEvent" ue ON ue."userId" = u."id"
      WHERE ${clauses.join(" AND ")}
      GROUP BY u."id"
      ORDER BY "costUsd" DESC, "usageEvents" DESC
      LIMIT 500
    `,
    params
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.fullName),
    role: String(row.role),
    teamId: row.teamId ? String(row.teamId) : null,
    createdAt: new Date(row.createdAt as string | Date),
    totalTokens: Number(row.totalTokens ?? 0),
    costUsd: Number(row.costUsd ?? 0),
    usageEvents: Number(row.usageEvents ?? 0),
    lastUsageAt: row.lastUsageAt ? new Date(row.lastUsageAt as string | Date) : null
  }));
}

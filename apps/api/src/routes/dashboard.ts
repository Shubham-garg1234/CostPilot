import type { FastifyInstance } from "fastify";
import {
  dashboardAggregateTotals,
  dashboardTopUsageByCost,
  dashboardTopUsageByTokens,
  dashboardUsageByProvider,
  dashboardUsageBySource,
} from "../db/usage.js";
import { listRecentViolations } from "../db/violations.js";
import { decimalNumber } from "../db/mappers.js";
import type { UsageSource } from "../db/types.js";
import { authenticate } from "../auth.js";
import { serializeUsageSource } from "../services/usage-source.js";
import { buildTrackingDashboardInsights } from "../services/tracking-dashboard-service.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/summary", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const orgId = request.auth.orgId;

    const [orgTotals, topUsers, topFeatures, sourceBreakdown, providerBreakdown, recentViolations] = await Promise.all([
      dashboardAggregateTotals(app.db, orgId),
      dashboardTopUsageByCost(app.db, orgId, 5),
      dashboardTopUsageByTokens(app.db, orgId, 5),
      dashboardUsageBySource(app.db, orgId),
      dashboardUsageByProvider(app.db, orgId),
      listRecentViolations(app.db, orgId, 8)
    ]);

    const trackingInsights =
      request.auth.authMode === "employee"
        ? null
        : await buildTrackingDashboardInsights(app.db, orgId, 30);

    return {
      metrics: [
        {
          label: "Total Tokens",
          value: Intl.NumberFormat("en-US").format(orgTotals.totalTokens),
          trend: "+18.2%"
        },
        {
          label: "Spend",
          value: `$${orgTotals.costUsd.toFixed(2)}`,
          trend: "+6.4%"
        },
        {
          label: "Requests",
          value: Intl.NumberFormat("en-US").format(orgTotals.requestCount),
          trend: "+12.1%"
        }
      ],
      topUsers: topUsers.map((entry) => ({
        id: entry.id,
        name: entry.fullName ?? "Unknown",
        role: entry.role,
        category: entry.category,
        costUsd: decimalNumber(entry.costUsd),
        tokens: entry.totalTokens,
        source: serializeUsageSource(entry.source as UsageSource)
      })),
      topFeatures: topFeatures.map((entry) => ({
        feature: entry.feature ?? "Unspecified",
        category: entry.category,
        costUsd: decimalNumber(entry.costUsd),
        tokens: entry.totalTokens,
        provider: entry.provider,
        source: serializeUsageSource(entry.source as UsageSource)
      })),
      sourceBreakdown: sourceBreakdown.map((entry) => ({
        source: serializeUsageSource(entry.source as UsageSource),
        costUsd: decimalNumber(entry.cost_usd),
        tokens: entry.total_tokens ?? 0,
        requests: entry.request_count ?? 0
      })),
      providerBreakdown: providerBreakdown.map((entry) => ({
        provider: entry.provider,
        costUsd: decimalNumber(entry.cost_usd),
        tokens: entry.total_tokens ?? 0,
        requests: entry.request_count ?? 0
      })),
      recentViolations,
      trackingInsights
    };
  });

  app.get("/api/dashboard/tracking-insights", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    if (request.auth.authMode === "employee") {
      return reply.status(403).send({ message: "Tracking insights are available to organization admins only." });
    }

    const days = Number((request.query as { days?: string }).days ?? 30);
    return buildTrackingDashboardInsights(app.db, request.auth.orgId, Number.isFinite(days) ? days : 30);
  });
}

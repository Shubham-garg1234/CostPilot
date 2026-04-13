import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { serializeUsageSource } from "../services/usage-source.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/summary", { preHandler: [authenticate] }, async (request) => {
    if (!app.prisma) {
      return {
        metrics: [
          { label: "Total Tokens", value: "44,800,000", trend: "+18.2%" },
          { label: "Spend", value: "$12,842.00", trend: "+6.4%" },
          { label: "Requests", value: "128,430", trend: "+12.1%" }
        ],
        topUsers: [
          { id: "demo-admin", name: "Ava Admin", role: "ADMIN", category: "chat", costUsd: 430.22, tokens: 1542000 }
        ],
        topFeatures: [
          { feature: "auto_reply", category: "email_generation", costUsd: 1210.54, tokens: 6400000 }
        ],
        sourceBreakdown: [
          { source: "sdk", costUsd: 3910, tokens: 12800000, requests: 32100 },
          { source: "cursor", costUsd: 5440, tokens: 17400000, requests: 50110 },
          { source: "codex", costUsd: 1852, tokens: 6200000, requests: 22820 }
        ],
        providerBreakdown: [
          { provider: "openai", costUsd: 7920, tokens: 28400000, requests: 77000 },
          { provider: "anthropic", costUsd: 3310, tokens: 9700000, requests: 29800 }
        ],
        recentViolations: []
      };
    }

    const where = { orgId: request.auth.orgId };

    const [orgTotals, topUsers, topFeatures, sourceBreakdown, providerBreakdown, recentViolations] = await Promise.all([
      app.prisma.usageAggregate.aggregate({
        where,
        _sum: { totalTokens: true, costUsd: true, requestCount: true }
      }),
      app.prisma.usageAggregate.findMany({
        where,
        take: 5,
        orderBy: { costUsd: "desc" },
        include: { user: true }
      }),
      app.prisma.usageAggregate.findMany({
        where,
        take: 5,
        orderBy: { totalTokens: "desc" }
      }),
      app.prisma.usageEvent.groupBy({
        by: ["source"],
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
      }),
      app.prisma.violation.findMany({
        where,
        take: 8,
        orderBy: { createdAt: "desc" }
      })
    ]);

    return {
      metrics: [
        {
          label: "Total Tokens",
          value: Intl.NumberFormat("en-US").format(orgTotals._sum.totalTokens ?? 0),
          trend: "+18.2%"
        },
        {
          label: "Spend",
          value: `$${Number(orgTotals._sum.costUsd ?? 0).toFixed(2)}`,
          trend: "+6.4%"
        },
        {
          label: "Requests",
          value: Intl.NumberFormat("en-US").format(orgTotals._sum.requestCount ?? 0),
          trend: "+12.1%"
        }
      ],
      topUsers: topUsers.map((entry) => ({
        id: entry.id,
        name: entry.user?.fullName ?? "Unknown",
        role: entry.role,
        category: entry.category,
        costUsd: Number(entry.costUsd),
        tokens: entry.totalTokens,
        source: serializeUsageSource(entry.source)
      })),
      topFeatures: topFeatures.map((entry) => ({
        feature: entry.feature ?? "Unspecified",
        category: entry.category,
        costUsd: Number(entry.costUsd),
        tokens: entry.totalTokens,
        provider: entry.provider,
        source: serializeUsageSource(entry.source)
      })),
      sourceBreakdown: sourceBreakdown.map((entry) => ({
        source: serializeUsageSource(entry.source),
        costUsd: Number(entry._sum.costUsd ?? 0),
        tokens: entry._sum.totalTokens ?? 0,
        requests: entry._count._all
      })),
      providerBreakdown: providerBreakdown.map((entry) => ({
        provider: entry.provider,
        costUsd: Number(entry._sum.costUsd ?? 0),
        tokens: entry._sum.totalTokens ?? 0,
        requests: entry._count._all
      })),
      recentViolations
    };
  });
}

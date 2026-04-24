import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { serializeUsageSource } from "../services/usage-source.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/summary", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
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

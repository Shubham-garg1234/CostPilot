import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";

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
        recentViolations: []
      };
    }

    const [orgTotals, topUsers, topFeatures, recentViolations] = await Promise.all([
      app.prisma.usageAggregate.aggregate({
        where: { orgId: request.auth.orgId },
        _sum: { totalTokens: true, costUsd: true, requestCount: true }
      }),
      app.prisma.usageAggregate.findMany({
        where: { orgId: request.auth.orgId },
        take: 5,
        orderBy: { costUsd: "desc" },
        include: { user: true }
      }),
      app.prisma.usageAggregate.findMany({
        where: { orgId: request.auth.orgId },
        take: 5,
        orderBy: { totalTokens: "desc" }
      }),
      app.prisma.violation.findMany({
        where: { orgId: request.auth.orgId },
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
        tokens: entry.totalTokens
      })),
      topFeatures: topFeatures.map((entry) => ({
        feature: entry.feature ?? "Unspecified",
        category: entry.category,
        costUsd: Number(entry.costUsd),
        tokens: entry.totalTokens
      })),
      recentViolations
    };
  });
}

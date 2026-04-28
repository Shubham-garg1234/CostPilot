import { ManagedClientType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildCursorManagedConfig } from "./cursor-managed-config.js";
import { getManagedGatewayKeyForUser } from "./managed-gateway-service.js";

export async function getEmployeeDashboard(app: FastifyInstance, input: {
  orgId: string;
  userId: string;
  email?: string;
  apiBaseUrl: string;
}) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const [totals, recentEvents, user, managedGatewayKey] = await Promise.all([
    app.prisma.usageEvent.aggregate({
      where: { orgId: input.orgId, userId: input.userId },
      _sum: { totalTokens: true, costUsd: true },
      _count: { _all: true }
    }),
    app.prisma.usageEvent.findMany({
      where: { orgId: input.orgId, userId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    app.prisma.user.findUnique({
      where: { id: input.userId },
      include: { organization: true }
    }),
    getManagedGatewayKeyForUser(app, {
      orgId: input.orgId,
      userId: input.userId,
      clientType: ManagedClientType.CURSOR,
      includeSecret: true
    })
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const fallbackMcpConfig = {
    mcpServers: {
      costpilot: {
        type: "stdio",
        command: "npx",
        args: ["-y", "--package=github:Shubham-garg1234/CostPilot_MCP", "costpilot-mcp"],
        env: {
          COSTPILOT_API_URL: input.apiBaseUrl,
          COSTPILOT_EMPLOYEE_EMAIL: user.email,
          COSTPILOT_EMPLOYEE_PASSWORD: "paste-your-password-here"
        }
      }
    }
  };

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      role: user.role
    },
    usage: {
      totalRequests: totals._count._all,
      totalTokens: totals._sum.totalTokens ?? 0,
      totalCostUsd: Number(totals._sum.costUsd ?? 0)
    },
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      model: event.model,
      provider: event.provider,
      category: event.category,
      feature: event.feature,
      status: event.status,
      totalTokens: event.totalTokens,
      costUsd: Number(event.costUsd),
      createdAt: event.createdAt.toISOString()
    })),
    compliance: {
      governedCursorRequired: user.organization.governedCursorRequired,
      state: user.cursorComplianceStatus,
      lastGovernedRequestAt: user.lastGovernedCursorRequestAt?.toISOString() ?? null,
      activeKey: managedGatewayKey?.key ?? null
    },
    cursorManagedConfig: buildCursorManagedConfig(input.apiBaseUrl, {
      gatewayKey: managedGatewayKey?.key ?? null,
      plaintextKey: managedGatewayKey?.secret ?? null,
      complianceState: user.cursorComplianceStatus,
      lastGovernedRequestAt: user.lastGovernedCursorRequestAt?.toISOString() ?? null
    }),
    fallbackMcpConfig
  };
}

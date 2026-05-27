import type { FastifyInstance } from "fastify";
import { aggregateUsageForUser, findUserWithOrganization, listRecentUsageForUser } from "../db/index.js";
import { decimalNumber } from "../db/mappers.js";

export async function getEmployeeDashboard(app: FastifyInstance, input: {
  orgId: string;
  userId: string;
  email?: string;
  apiBaseUrl: string;
}) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const [totals, recentEvents, userWithOrg] = await Promise.all([
    aggregateUsageForUser(app.db, input.orgId, input.userId),
    listRecentUsageForUser(app.db, input.orgId, input.userId, 10),
    findUserWithOrganization(app.db, input.userId)
  ]);

  if (!userWithOrg) {
    throw new Error("User not found.");
  }

  const { user, organization } = userWithOrg;

  const cursorConfig = {
    mcpServers: {
      costpilot: {
        type: "stdio",
        command: "npx",
        args: ["-y", "github:Shubham-garg1234/CostPilot_MCP"],
        env: {
          COSTPILOT_API_URL: input.apiBaseUrl.replace(/\/$/, ""),
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
      organizationName: organization.name,
      role: user.role
    },
    usage: {
      totalRequests: totals.requestCount,
      totalTokens: totals.totalTokens,
      totalCostUsd: roundCostUsd(totals.costUsd)
    },
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      model: event.model,
      provider: event.provider,
      category: event.category,
      feature: event.feature,
      totalTokens: event.totalTokens,
      costUsd: roundCostUsd(event.costUsd),
      createdAt: event.createdAt.toISOString()
    })),
    cursorConfig
  };
}

function roundCostUsd(value: number | string | null | undefined) {
  return Number(decimalNumber(value).toFixed(6));
}

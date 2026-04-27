import type { FastifyInstance } from "fastify";

export async function getEmployeeDashboard(app: FastifyInstance, input: {
  orgId: string;
  userId: string;
  email?: string;
  apiBaseUrl: string;
}) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const [totals, recentEvents, user] = await Promise.all([
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
    })
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const cursorConfig = {
    mcpServers: {
      costpilot: {
        type: "stdio",
        command: "npx",
        args: ["-y", "github:Shubham-garg1234/CostPilot_MCP"],
        env: {
          COSTPILOT_API_URL: process.env.COSTPILOT_API_URL,
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
      totalTokens: event.totalTokens,
      costUsd: Number(event.costUsd),
      createdAt: event.createdAt.toISOString()
    })),
    cursorConfig
  };
}

function getCursorApiUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.trim();

  if (!trimmed) {
    return "http://localhost:4000/";
  }

  if (trimmed.startsWith("http://127.0.0.1:4000")) {
    return "http://localhost:4000/";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

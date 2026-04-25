import { RoleKey } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../auth.js";
import { getEnvConfig } from "../config.js";
import { createEmployeeAccessToken, verifyPassword } from "../services/employee-auth-service.js";
import { getEmployeeDashboard } from "../services/employee-dashboard-service.js";
import { getOrganizationSnapshot } from "../services/organization-service.js";
import { z } from "zod";

const employeeLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/employee-login", async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const body = employeeLoginSchema.parse(request.body);
    const env = getEnvConfig();
    const user = await app.prisma.user.findUnique({
      where: {
        email: body.email
      },
      include: {
        organization: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.status(401).send({ message: "Invalid email or password." });
    }

    const token = createEmployeeAccessToken(
      {
        userId: user.id,
        orgId: user.organizationId,
        role: user.role,
        teamId: user.teamId,
        email: user.email,
        name: user.fullName
      },
      env.EMPLOYEE_AUTH_SECRET
    );

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        orgId: user.organizationId,
        organizationName: user.organization.name,
        organizationSlug: user.organization.slug,
        role: user.role
      }
    };
  });

  app.get("/api/auth/session", { preHandler: [authenticate] }, async (request, reply) => {
    const env = getEnvConfig();
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const snapshot = await getOrganizationSnapshot(app, request.auth.orgId);

    return {
      authMode: request.auth.authMode,
      clerkEnabled: env.AUTH_MODE === "clerk",
      user: request.auth,
      availableRoles: Object.values(RoleKey),
      availableTeams: snapshot.teams
    };
  });

  app.get("/api/auth/employee-dashboard", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.authMode !== "employee") {
      return reply.status(403).send({ message: "Employee dashboard is only available for employee login sessions." });
    }

    const env = getEnvConfig();
    return await getEmployeeDashboard(app, {
      orgId: request.auth.orgId,
      userId: request.auth.userId,
      email: request.auth.email,
      apiBaseUrl: resolvePublicApiBaseUrl(request, env)
    });
  });

  app.post("/api/auth/logout", async () => {
    return { ok: true };
  });
}

function resolvePublicApiBaseUrl(
  request: FastifyRequest,
  env: ReturnType<typeof getEnvConfig>
) {
  if (env.COSTPILOT_API_URL) {
    return env.COSTPILOT_API_URL;
  }

  if (env.NEXT_PUBLIC_API_URL) {
    return env.NEXT_PUBLIC_API_URL;
  }

  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = forwardedHost || request.headers.host;
  const protocol = forwardedProto || request.protocol || "https";

  return `${protocol}://${host}`;
}

import { RoleKey } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { getEnvConfig } from "../config.js";
import { getOrganizationSnapshot } from "../services/organization-service.js";

export async function registerAuthRoutes(app: FastifyInstance) {
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

  app.post("/api/auth/logout", async () => {
    return { ok: true };
  });
}

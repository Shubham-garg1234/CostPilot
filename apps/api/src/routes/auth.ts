import { RoleKey } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate, createDemoToken } from "../auth.js";
import { getEnvConfig } from "../config.js";
import { getOrganizationSnapshot } from "../services/organization-service.js";

const demoLoginSchema = z.object({
  role: z.nativeEnum(RoleKey),
  teamId: z.string().optional(),
  orgId: z.string().default("acme-org"),
  userId: z.string().default("demo-user"),
  email: z.string().email().default("demo.user@acme.ai"),
  name: z.string().default("Demo User")
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/session", { preHandler: [authenticate] }, async (request) => {
    const env = getEnvConfig();
    const snapshot = await getOrganizationSnapshot(app, request.auth.orgId);

    return {
      authMode: request.auth.authMode,
      clerkEnabled: env.AUTH_MODE === "clerk",
      user: request.auth,
      availableRoles: Object.values(RoleKey),
      availableTeams: snapshot.teams
    };
  });

  app.post("/api/auth/demo-login", async (request, reply) => {
    if (getEnvConfig().AUTH_MODE !== "demo") {
      return reply.status(400).send({ message: "Demo login is only available in AUTH_MODE=demo." });
    }

    const body = demoLoginSchema.parse(request.body);
    const token = createDemoToken({
      userId: body.userId,
      orgId: body.orgId,
      role: body.role,
      teamId: body.teamId,
      email: body.email,
      name: body.name
    });

    return reply.send({
      token,
      authMode: "demo",
      user: {
        userId: body.userId,
        orgId: body.orgId,
        role: body.role,
        teamId: body.teamId,
        email: body.email,
        name: body.name
      }
    });
  });

  app.post("/api/auth/logout", async () => {
    return { ok: true };
  });
}

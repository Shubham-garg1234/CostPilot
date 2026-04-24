import { RoleKey } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import {
  createOrganizationRecord,
  createTeamRecord,
  createUserRecord,
  getOrganizationSnapshot
} from "../services/organization-service.js";

const organizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2)
});

const teamSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2),
  departmentCode: z.string().optional()
});

const userSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(2),
  role: z.nativeEnum(RoleKey),
  teamId: z.string().optional(),
  clerkUserId: z.string().optional()
});

export async function registerOrganizationRoutes(app: FastifyInstance) {
  app.get("/api/organizations/current", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    return getOrganizationSnapshot(app, request.auth.orgId);
  });

  app.post("/api/organizations", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can create organizations." });
    }

    const body = organizationSchema.parse(request.body);
    return reply.status(201).send(
      await createOrganizationRecord(app, {
        name: body.name,
        slug: body.slug
      })
    );
  });

  app.post("/api/teams", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN && request.auth.role !== RoleKey.MANAGER) {
      return reply.status(403).send({ message: "Only admins and managers can create teams." });
    }

    const body = teamSchema.parse(request.body);
    return reply.status(201).send(
      await createTeamRecord(app, {
        organizationId: body.organizationId,
        name: body.name,
        departmentCode: body.departmentCode
      })
    );
  });

  app.post("/api/users", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN && request.auth.role !== RoleKey.MANAGER) {
      return reply.status(403).send({ message: "Only admins and managers can add users." });
    }

    const body = userSchema.parse(request.body);
    return reply.status(201).send(
      await createUserRecord(app, {
        organizationId: body.organizationId,
        email: body.email,
        fullName: body.fullName,
        role: body.role,
        teamId: body.teamId,
        clerkUserId: body.clerkUserId
      })
    );
  });
}

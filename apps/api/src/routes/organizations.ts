import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate, authenticateOrganizationSetup } from "../auth.js";
import { isUniqueViolation } from "../db/index.js";
import { RoleKey, roleKeyValues } from "../db/types.js";
import {
  OrganizationConflictError,
  OrganizationNotFoundError,
  createOrganizationWithAdminUserRecord,
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
  name: z.string().min(2),
  departmentCode: z.string().optional()
});

const userSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: z.enum(roleKeyValues),
  teamId: z.string().optional(),
  managerId: z.string().optional(),
  clerkUserId: z.string().optional()
});

export async function registerOrganizationRoutes(app: FastifyInstance) {
  app.get("/api/organizations/current", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    try {
      return await getOrganizationSnapshot(app, request.auth.orgId);
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.post("/api/organizations", { preHandler: [authenticateOrganizationSetup] }, async (request, reply) => {
    if (request.auth && request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can create organizations." });
    }

    const body = organizationSchema.parse(request.body);

    try {
      const organization = request.auth
        ? await createOrganizationRecord(app, {
            name: body.name,
            slug: body.slug,
            currentOrgId: request.auth.orgId,
            actorUserId: request.auth.userId
          })
        : await createOrganizationWithAdminUserRecord(app, {
            name: body.name,
            slug: body.slug,
            clerkUserId: request.organizationSetupAuth!.clerkUserId,
            email: request.organizationSetupAuth!.email,
            fullName: request.organizationSetupAuth!.name
          });

      return reply.status(organization.created ? 201 : 200).send(organization);
    } catch (error) {
      if (error instanceof OrganizationConflictError) {
        return reply.status(409).send({ message: error.message });
      }
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ message: "That organization slug is already in use." });
      }

      throw error;
    }
  });

  app.post("/api/teams", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN && request.auth.role !== RoleKey.MANAGER) {
      return reply.status(403).send({ message: "Only admins and managers can create teams." });
    }

    const body = teamSchema.parse(request.body);

    try {
      return reply.status(201).send(
        await createTeamRecord(app, {
          organizationId: request.auth.orgId,
          name: body.name,
          departmentCode: body.departmentCode
        })
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ message: "A team with that name already exists in this organization." });
      }

      throw error;
    }
  });

  app.post("/api/users", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN && request.auth.role !== RoleKey.MANAGER) {
      return reply.status(403).send({ message: "Only admins and managers can add users." });
    }

    const body = userSchema.parse(request.body);

    try {
      return reply.status(201).send(
        await createUserRecord(app, {
          organizationId: request.auth.orgId,
          email: body.email,
          fullName: body.fullName,
          role: body.role,
          teamId: body.teamId,
          managerId: body.managerId,
          clerkUserId: body.clerkUserId
        })
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.status(409).send({ message: "A user with that email or Clerk account already exists." });
      }

      if (error instanceof Error && error.message === "Selected team does not belong to the current organization.") {
        return reply.status(400).send({ message: error.message });
      }

      if (
        error instanceof Error &&
        (error.message === "Selected manager does not belong to the current organization." ||
          error.message === "Selected manager must have MANAGER or ADMIN role.")
      ) {
        return reply.status(400).send({ message: error.message });
      }

      throw error;
    }
  });
}

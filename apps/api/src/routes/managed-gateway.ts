import {
  ManagedClientType,
  ManagedCursorComplianceStatus,
  RoleKey
} from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import {
  ManagedGatewayKeyConflictError,
  ManagedGatewayKeyNotFoundError,
  issueManagedGatewayKey,
  revokeManagedGatewayKey,
  rotateManagedGatewayKey
} from "../services/managed-gateway-service.js";

const issueKeySchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2).default("Managed Cursor Key"),
  clientType: z.nativeEnum(ManagedClientType).default(ManagedClientType.CURSOR),
  expiresAt: z.string().datetime().optional()
});

const updateComplianceSchema = z.object({
  complianceStatus: z.nativeEnum(ManagedCursorComplianceStatus)
});

const updateGovernanceSchema = z.object({
  governedCursorRequired: z.boolean()
});

export async function registerManagedGatewayRoutes(app: FastifyInstance) {
  app.post("/api/managed-gateway/keys", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can issue managed gateway keys." });
    }

    const body = issueKeySchema.parse(request.body);

    try {
      return reply.status(201).send(
        await issueManagedGatewayKey(app, {
          orgId: request.auth.orgId,
          userId: body.userId,
          name: body.name,
          clientType: body.clientType,
          issuedBy: request.auth.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
        })
      );
    } catch (error) {
      if (error instanceof ManagedGatewayKeyConflictError) {
        return reply.status(409).send({ message: error.message });
      }

      if (error instanceof ManagedGatewayKeyNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.post("/api/managed-gateway/keys/:keyId/rotate", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can rotate managed gateway keys." });
    }

    const keyId = String((request.params as Record<string, string>).keyId ?? "");
    const body = issueKeySchema.partial().parse(request.body ?? {});

    try {
      return await rotateManagedGatewayKey(app, {
        orgId: request.auth.orgId,
        keyId,
        issuedBy: request.auth.userId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
      });
    } catch (error) {
      if (error instanceof ManagedGatewayKeyConflictError) {
        return reply.status(409).send({ message: error.message });
      }

      if (error instanceof ManagedGatewayKeyNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.post("/api/managed-gateway/keys/:keyId/revoke", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can revoke managed gateway keys." });
    }

    const keyId = String((request.params as Record<string, string>).keyId ?? "");

    try {
      return await revokeManagedGatewayKey(app, {
        orgId: request.auth.orgId,
        keyId
      });
    } catch (error) {
      if (error instanceof ManagedGatewayKeyNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });

  app.patch("/api/managed-gateway/users/:userId/compliance", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can update compliance state." });
    }

    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const userId = String((request.params as Record<string, string>).userId ?? "");
    const body = updateComplianceSchema.parse(request.body);
    const user = await app.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: request.auth.orgId
      }
    });

    if (!user) {
      return reply.status(404).send({ message: "User not found in this organization." });
    }

    const updated = await app.prisma.user.update({
      where: { id: userId },
      data: {
        cursorComplianceStatus: body.complianceStatus,
        cursorComplianceUpdatedAt: new Date()
      }
    });

    return {
      userId: updated.id,
      cursorComplianceStatus: updated.cursorComplianceStatus,
      cursorComplianceUpdatedAt: updated.cursorComplianceUpdatedAt?.toISOString() ?? null
    };
  });

  app.patch("/api/managed-gateway/governance/cursor", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can update governed Cursor enforcement." });
    }

    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const body = updateGovernanceSchema.parse(request.body);
    const organization = await app.prisma.organization.update({
      where: { id: request.auth.orgId },
      data: {
        governedCursorRequired: body.governedCursorRequired
      }
    });

    return {
      organizationId: organization.id,
      governedCursorRequired: organization.governedCursorRequired
    };
  });
}

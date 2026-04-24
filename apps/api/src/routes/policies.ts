import { Prisma, RoleKey, ViolationAction } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";

const policySchema = z.object({
  role: z.nativeEnum(RoleKey),
  category: z.string().min(1),
  feature: z.string().optional(),
  maxTokensPerDay: z.number().int().nullable().optional(),
  maxRequestsPerHour: z.number().int().nullable().optional(),
  maxCostPerMonthUsd: z.number().nullable().optional(),
  allowedModels: z.array(z.string()).default([]),
  actionOnViolation: z.nativeEnum(ViolationAction),
  cooldownMinutes: z.number().int().default(0),
  featureLocked: z.boolean().default(false)
});

export async function registerPolicyRoutes(app: FastifyInstance) {
  app.get("/api/policies", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    return app.prisma.policy.findMany({
      where: { orgId: request.auth.orgId },
      orderBy: [{ role: "asc" }, { category: "asc" }]
    });
  });

  app.post("/api/policies", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN && request.auth.role !== RoleKey.MANAGER) {
      return reply.status(403).send({ message: "Only admins and managers can create policies." });
    }

    if (!app.prisma) {
      return reply.status(503).send({ message: "Policy writes are unavailable until PostgreSQL is healthy." });
    }

    const body = policySchema.parse(request.body);

    const data: Prisma.PolicyUncheckedCreateInput = {
      orgId: request.auth.orgId,
      role: body.role,
      category: body.category,
      feature: body.feature ?? null,
      maxTokensPerDay: body.maxTokensPerDay ?? null,
      maxRequestsPerHour: body.maxRequestsPerHour ?? null,
      maxCostPerMonthUsd: body.maxCostPerMonthUsd ?? null,
      allowedModels: body.allowedModels,
      actionOnViolation: body.actionOnViolation,
      cooldownMinutes: body.cooldownMinutes,
      featureLocked: body.featureLocked
    };

    const policy = await app.prisma.policy.create({ data });

    return reply.status(201).send(policy);
  });
}

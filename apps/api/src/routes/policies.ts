import { RoleKey, ViolationAction } from "@prisma/client";
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
  app.get("/api/policies", { preHandler: [authenticate] }, async (request) => {
    if (!app.prisma) {
      return [
        {
          id: "demo-policy-intern",
          orgId: request.auth.orgId,
          role: "INTERN",
          category: "code_generation",
          feature: "copilot",
          maxTokensPerDay: 0,
          maxRequestsPerHour: 0,
          maxCostPerMonthUsd: 0,
          allowedModels: ["gpt-4o-mini"],
          disabled: false,
          cooldownMinutes: 60,
          featureLocked: true,
          actionOnViolation: "BLOCK"
        },
        {
          id: "demo-policy-sde1",
          orgId: request.auth.orgId,
          role: "SDE1",
          category: "email_generation",
          feature: "auto_reply",
          maxTokensPerDay: 10000,
          maxRequestsPerHour: 5,
          maxCostPerMonthUsd: 50,
          allowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
          disabled: false,
          cooldownMinutes: 15,
          featureLocked: false,
          actionOnViolation: "WARN"
        }
      ];
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

    const body = policySchema.parse(request.body);
    if (!app.prisma) {
      return reply.status(201).send({
        id: "demo-created-policy",
        orgId: request.auth.orgId,
        ...body
      });
    }

    const policy = await app.prisma.policy.create({
      data: {
        orgId: request.auth.orgId,
        ...body
      }
    });

    return reply.status(201).send(policy);
  });
}

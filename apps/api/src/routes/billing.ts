import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { generateMonthlyBilling } from "../services/billing-service.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get("/api/billing/current", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.prisma) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const records = await app.prisma.billingRecord.findMany({
      where: { orgId: request.auth.orgId },
      take: 6,
      orderBy: { periodStart: "desc" }
    });

    return { records };
  });

  app.post("/api/billing/generate", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== "ADMIN") {
      return reply.status(403).send({ message: "Only admins can generate billing." });
    }

    if (!app.prisma) {
      return reply.status(503).send({ message: "Billing generation is unavailable until PostgreSQL is healthy." });
    }

    const record = await generateMonthlyBilling(app, request.auth.orgId);
    return reply.status(201).send(record);
  });
}

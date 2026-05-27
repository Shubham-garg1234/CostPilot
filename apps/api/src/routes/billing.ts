import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { listBillingRecords } from "../db/index.js";
import { RoleKey } from "../db/types.js";
import { generateMonthlyBilling } from "../services/billing-service.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.get("/api/billing/current", { preHandler: [authenticate] }, async (request, reply) => {
    if (!app.db) {
      return reply.status(503).send({ message: "PostgreSQL is unavailable." });
    }

    const records = await listBillingRecords(app.db, request.auth.orgId, 6);

    return { records };
  });

  app.post("/api/billing/generate", { preHandler: [authenticate] }, async (request, reply) => {
    if (request.auth.role !== RoleKey.ADMIN) {
      return reply.status(403).send({ message: "Only admins can generate billing." });
    }

    if (!app.db) {
      return reply.status(503).send({ message: "Billing generation is unavailable until PostgreSQL is healthy." });
    }

    const record = await generateMonthlyBilling(app, request.auth.orgId);
    return reply.status(201).send(record);
  });
}

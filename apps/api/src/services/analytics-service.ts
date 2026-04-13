import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { UsageEventInput } from "../types.js";

export async function enqueueApiLog(app: FastifyInstance, payload: UsageEventInput) {
  await app.analyticsQueue.add("write-log", payload, {
    removeOnComplete: 1000,
    removeOnFail: 1000
  });
}

export async function persistUsageEvent(app: FastifyInstance, payload: UsageEventInput) {
  if (!app.prisma) {
    app.log.info({ payload }, "Skipping usage persistence because PostgreSQL is unavailable");
    return null;
  }

  const dayBucket = dayjs().startOf("day").toDate();
  const hourBucket = dayjs().startOf("hour").toDate();
  const monthBucket = dayjs().startOf("month").toDate();

  try {
    return await app.prisma.$transaction(async (tx) => {
      const usageEvent = await tx.usageEvent.create({
        data: {
          requestId: payload.requestId,
          orgId: payload.auth.orgId,
          userId: payload.auth.userId,
          teamId: payload.auth.teamId ?? undefined,
          role: payload.auth.role,
          source: payload.source,
          integrationType: payload.integrationType,
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          category: payload.category,
          feature: payload.feature,
          provider: payload.provider,
          model: payload.model,
          status: payload.status,
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
          totalTokens: payload.totalTokens,
          costUsd: payload.costUsd,
          metadata: payload.metadata as Prisma.InputJsonValue | undefined,
          startedAt: payload.startedAt,
          completedAt: payload.completedAt
        }
      });

      await tx.usageAggregate.create({
        data: {
          orgId: payload.auth.orgId,
          userId: payload.auth.userId,
          teamId: payload.auth.teamId ?? undefined,
          role: payload.auth.role,
          source: payload.source,
          integrationType: payload.integrationType,
          workspaceId: payload.workspaceId,
          sessionId: payload.sessionId,
          dayBucket,
          hourBucket,
          monthBucket,
          category: payload.category,
          feature: payload.feature,
          provider: payload.provider,
          model: payload.model,
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
          totalTokens: payload.totalTokens,
          requestCount: 1,
          costUsd: payload.costUsd
        }
      });

      return usageEvent;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      app.log.info({ requestId: payload.requestId }, "Skipping duplicate usage event");
      return null;
    }

    app.log.warn({ error, requestId: payload.requestId }, "Usage persistence failed");
    return null;
  }
}

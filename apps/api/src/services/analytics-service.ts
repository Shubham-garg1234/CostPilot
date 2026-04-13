import dayjs from "dayjs";
import type { FastifyInstance } from "fastify";

type LogRequestInput = {
  auth: {
    userId: string;
    orgId: string;
    role: string;
    teamId?: string | null;
  };
  model: string;
  category: string;
  feature?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
  warning?: string;
};

export async function enqueueApiLog(app: FastifyInstance, payload: LogRequestInput) {
  await app.analyticsQueue.add("write-log", payload, {
    removeOnComplete: 1000,
    removeOnFail: 1000
  });
}

export async function persistAggregate(app: FastifyInstance, payload: LogRequestInput) {
  if (!app.prisma) {
    app.log.info({ payload }, "Skipping aggregate persistence because PostgreSQL is unavailable");
    return;
  }

  const dayBucket = dayjs().startOf("day").toDate();
  const hourBucket = dayjs().startOf("hour").toDate();
  const monthBucket = dayjs().startOf("month").toDate();

  await app.prisma.usageAggregate.create({
    data: {
      orgId: payload.auth.orgId,
      userId: payload.auth.userId,
      teamId: payload.auth.teamId ?? undefined,
      role: payload.auth.role as never,
      dayBucket,
      hourBucket,
      monthBucket,
      category: payload.category,
      feature: payload.feature,
      model: payload.model,
      promptTokens: payload.promptTokens,
      completionTokens: payload.completionTokens,
      totalTokens: payload.totalTokens,
      requestCount: 1,
      costUsd: payload.costUsd
    }
  }).catch(() => null);
}

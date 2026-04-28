import dayjs from "dayjs";
import {
  ManagedClientType,
  ManagedCursorComplianceStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { AnalyticsWriteResult, AuthContext, UsageEventInput } from "../types.js";

export async function persistUsageEvent(app: FastifyInstance, payload: UsageEventInput) {
  if (!app.prisma) {
    app.log.info({ payload }, "Skipping usage persistence because PostgreSQL is unavailable");
    return null;
  }

  try {
    return await app.prisma.$transaction(async (tx) => {
      const usageEvent = await tx.usageEvent.create({
        data: buildUsageEventCreateData(payload)
      });

      await upsertUsageAggregate(tx, payload);
      await touchManagedGatewayUsage(tx, payload.auth, payload.completedAt ?? payload.startedAt ?? new Date());

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

export async function findUsageEventByRequestId(app: FastifyInstance, requestId: string) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.usageEvent.findUnique({
    where: { requestId }
  });
}

export async function createPendingUsageEvent(
  app: FastifyInstance,
  payload: UsageEventInput
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  if (!payload.requestId) {
    throw new Error("Pending governed usage events require a requestId.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const usageEvent = await tx.usageEvent.create({
      data: buildUsageEventCreateData({
        ...payload,
        status: "pending",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        completedAt: undefined
      })
    });

    await touchManagedGatewayUsage(tx, payload.auth, payload.startedAt ?? new Date());
    return usageEvent;
  });
}

export async function recordRequestWithoutUpstream(
  app: FastifyInstance,
  payload: UsageEventInput
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  try {
    return await app.prisma.$transaction(async (tx) => {
      const usageEvent = await tx.usageEvent.create({
        data: buildUsageEventCreateData(payload)
      });

      await touchManagedGatewayUsage(tx, payload.auth, payload.completedAt ?? payload.startedAt ?? new Date());
      return usageEvent;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return await app.prisma.usageEvent.findUnique({
        where: { requestId: payload.requestId ?? "" }
      });
    }

    throw error;
  }
}

export async function finalizeUsageEventSuccess(
  app: FastifyInstance,
  input: {
    eventId: string;
    payload: UsageEventInput;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const existingEvent = await tx.usageEvent.findUnique({
      where: { id: input.eventId }
    });

    if (!existingEvent) {
      throw new Error("Pending usage event could not be found.");
    }

    const mergedMetadata = mergeMetadata(existingEvent.metadata, input.payload.metadata);
    const updatedEvent = await tx.usageEvent.update({
      where: { id: input.eventId },
      data: {
        status: input.payload.status,
        promptTokens: input.payload.promptTokens,
        completionTokens: input.payload.completionTokens,
        totalTokens: input.payload.totalTokens,
        costUsd: input.payload.costUsd,
        metadata: toJsonValue(mergedMetadata),
        completedAt: input.payload.completedAt ?? new Date()
      }
    });

    await upsertUsageAggregate(tx, input.payload);
    await touchManagedGatewayUsage(tx, input.payload.auth, input.payload.completedAt ?? new Date());

    return updatedEvent;
  });
}

export async function updateUsageEventStatus(
  app: FastifyInstance,
  input: {
    eventId: string;
    status: string;
    metadata?: Record<string, unknown>;
    completedAt?: Date;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  }
) {
  if (!app.prisma) {
    throw new Error("PostgreSQL is unavailable.");
  }

  return await app.prisma.$transaction(async (tx) => {
    const existingEvent = await tx.usageEvent.findUnique({
      where: { id: input.eventId }
    });

    if (!existingEvent) {
      throw new Error("Usage event could not be found.");
    }

    const mergedMetadata = mergeMetadata(existingEvent.metadata, input.metadata);
    return await tx.usageEvent.update({
      where: { id: input.eventId },
      data: {
        status: input.status,
        promptTokens: input.promptTokens ?? existingEvent.promptTokens,
        completionTokens: input.completionTokens ?? existingEvent.completionTokens,
        totalTokens: input.totalTokens ?? existingEvent.totalTokens,
        costUsd: input.costUsd ?? Number(existingEvent.costUsd),
        metadata: toJsonValue(mergedMetadata),
        completedAt: input.completedAt ?? new Date()
      }
    });
  });
}

export async function mirrorUsageEventToAnalytics(
  app: FastifyInstance,
  payload: UsageEventInput
): Promise<AnalyticsWriteResult> {
  if (!app.clickhouse) {
    return {
      persisted: false,
      status: "skipped",
      detail: "ClickHouse is unavailable."
    };
  }

  try {
    await app.clickhouse.insertUsageEvent(payload);
    return {
      persisted: true,
      status: "written"
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Analytics write failed";
    app.log.warn({ error, requestId: payload.requestId }, "ClickHouse analytics mirror failed");
    return {
      persisted: false,
      status: "skipped",
      detail
    };
  }
}

function buildUsageEventCreateData(payload: UsageEventInput): Prisma.UsageEventUncheckedCreateInput {
  return {
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
    metadata: toJsonValue(payload.metadata),
    startedAt: payload.startedAt,
    completedAt: payload.completedAt
  };
}

async function upsertUsageAggregate(tx: Prisma.TransactionClient, payload: UsageEventInput) {
  const { dayBucket, hourBucket, monthBucket } = currentBuckets();
  const existingAggregate = await tx.usageAggregate.findFirst({
    where: {
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
      model: payload.model
    }
  });

  if (existingAggregate) {
    await tx.usageAggregate.update({
      where: { id: existingAggregate.id },
      data: {
        promptTokens: { increment: payload.promptTokens },
        completionTokens: { increment: payload.completionTokens },
        totalTokens: { increment: payload.totalTokens },
        requestCount: { increment: 1 },
        costUsd: { increment: payload.costUsd }
      }
    });
    return;
  }

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
}

async function touchManagedGatewayUsage(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  seenAt: Date
) {
  if (auth.authMode !== "managed_gateway" || !auth.gatewayKeyId) {
    return;
  }

  await tx.managedGatewayKey.update({
    where: { id: auth.gatewayKeyId },
    data: { lastUsedAt: seenAt }
  }).catch(() => null);

  if (auth.managedClientType !== ManagedClientType.CURSOR) {
    return;
  }

  await tx.user.update({
    where: { id: auth.userId },
    data: {
      cursorComplianceStatus: ManagedCursorComplianceStatus.COMPLIANT,
      cursorComplianceUpdatedAt: seenAt,
      lastGovernedCursorRequestAt: seenAt
    }
  }).catch(() => null);
}

function currentBuckets() {
  return {
    dayBucket: dayjs().startOf("day").toDate(),
    hourBucket: dayjs().startOf("hour").toDate(),
    monthBucket: dayjs().startOf("month").toDate()
  };
}

function mergeMetadata(
  existing: Prisma.JsonValue | null | undefined,
  additions?: Record<string, unknown>
) {
  const existingObject =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return {
    ...existingObject,
    ...(additions ?? {})
  };
}

function toJsonValue(value?: Record<string, unknown>) {
  return value ? (value as Prisma.InputJsonValue) : undefined;
}

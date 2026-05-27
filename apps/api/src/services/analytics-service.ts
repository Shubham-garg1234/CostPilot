import type { FastifyInstance } from "fastify";
import { persistUsageEvent as insertUsageEvent } from "../db/index.js";
import type { AnalyticsWriteResult, UsageEventInput } from "../types.js";

export async function persistUsageEvent(app: FastifyInstance, payload: UsageEventInput) {
  if (!app.db) {
    app.log.info({ payload }, "Skipping usage persistence because PostgreSQL is unavailable");
    return null;
  }

  try {
    return await insertUsageEvent(app.db, payload);
  } catch (error) {
    app.log.warn({ error, requestId: payload.requestId }, "Usage persistence failed");
    return null;
  }
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

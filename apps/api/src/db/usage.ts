import dayjs from "dayjs";
import type { PoolClient } from "pg";
import type { UsageEventInput } from "../types.js";
import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapUsageAggregate, mapUsageEvent } from "./mappers.js";
import type { UsageEventRow } from "./types.js";
import { queryClient } from "./client.js";

export async function persistUsageEvent(db: Db, payload: UsageEventInput): Promise<UsageEventRow | null> {
  try {
    return await db.transaction(async (client) => {
      const usageEvent = await insertUsageEvent(client, payload);
      await upsertUsageAggregate(client, payload);
      return usageEvent;
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code: string }).code : "";
    if (code === "23505") {
      return null;
    }
    throw error;
  }
}

async function insertUsageEvent(client: PoolClient, payload: UsageEventInput) {
  const id = createId();
  const now = new Date();
  const result = await queryClient(
    client,
    `
      INSERT INTO "UsageEvent" (
        "id", "requestId", "orgId", "userId", "teamId", "role", "source", "integrationType",
        "workspaceId", "sessionId", "category", "feature", "provider", "model", "status",
        "promptTokens", "completionTokens", "totalTokens", "costUsd", "metadata",
        "startedAt", "completedAt", "createdAt"
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) RETURNING *
    `,
    [
      id,
      payload.requestId ?? null,
      payload.auth.orgId,
      payload.auth.userId,
      payload.auth.teamId ?? null,
      payload.auth.role,
      payload.source,
      payload.integrationType,
      payload.workspaceId ?? null,
      payload.sessionId ?? null,
      payload.category,
      payload.feature ?? null,
      payload.provider,
      payload.model,
      payload.status,
      payload.promptTokens,
      payload.completionTokens,
      payload.totalTokens,
      payload.costUsd,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.startedAt ?? null,
      payload.completedAt ?? null,
      now
    ]
  );

  return mapUsageEvent(result.rows[0]!);
}

async function upsertUsageAggregate(client: PoolClient, payload: UsageEventInput) {
  const dayBucket = dayjs().startOf("day").toDate();
  const hourBucket = dayjs().startOf("hour").toDate();
  const monthBucket = dayjs().startOf("month").toDate();

  const existing = await queryClient<{ id: string }>(
    client,
    `
      SELECT "id" FROM "UsageAggregate"
      WHERE "orgId" = $1 AND "userId" IS NOT DISTINCT FROM $2 AND "teamId" IS NOT DISTINCT FROM $3
        AND role IS NOT DISTINCT FROM $4 AND source = $5 AND "integrationType" = $6
        AND "workspaceId" IS NOT DISTINCT FROM $7 AND "sessionId" IS NOT DISTINCT FROM $8
        AND "dayBucket" = $9 AND "hourBucket" = $10 AND "monthBucket" = $11
        AND category = $12 AND feature IS NOT DISTINCT FROM $13 AND provider = $14 AND model = $15
      LIMIT 1
    `,
    [
      payload.auth.orgId,
      payload.auth.userId,
      payload.auth.teamId ?? null,
      payload.auth.role,
      payload.source,
      payload.integrationType,
      payload.workspaceId ?? null,
      payload.sessionId ?? null,
      dayBucket,
      hourBucket,
      monthBucket,
      payload.category,
      payload.feature ?? null,
      payload.provider,
      payload.model
    ]
  );

  if (existing.rows[0]) {
    await queryClient(
      client,
      `
        UPDATE "UsageAggregate" SET
          "promptTokens" = "promptTokens" + $2,
          "completionTokens" = "completionTokens" + $3,
          "totalTokens" = "totalTokens" + $4,
          "requestCount" = "requestCount" + 1,
          "costUsd" = "costUsd" + $5,
          "updatedAt" = $6
        WHERE "id" = $1
      `,
      [existing.rows[0].id, payload.promptTokens, payload.completionTokens, payload.totalTokens, payload.costUsd, new Date()]
    );
    return;
  }

  const id = createId();
  const now = new Date();
  await queryClient(
    client,
    `
      INSERT INTO "UsageAggregate" (
        "id", "orgId", "userId", "teamId", role, source, "integrationType", "workspaceId", "sessionId",
        "dayBucket", "hourBucket", "monthBucket", category, feature, provider, model,
        "promptTokens", "completionTokens", "totalTokens", "requestCount", "costUsd", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,1,$20,$21,$21)
    `,
    [
      id,
      payload.auth.orgId,
      payload.auth.userId,
      payload.auth.teamId ?? null,
      payload.auth.role,
      payload.source,
      payload.integrationType,
      payload.workspaceId ?? null,
      payload.sessionId ?? null,
      dayBucket,
      hourBucket,
      monthBucket,
      payload.category,
      payload.feature ?? null,
      payload.provider,
      payload.model,
      payload.promptTokens,
      payload.completionTokens,
      payload.totalTokens,
      payload.costUsd,
      now
    ]
  );
}

export async function aggregateUsageForUser(db: Db, orgId: string, userId: string) {
  const result = await db.query<{
    total_tokens: string;
    cost_usd: string;
    request_count: string;
  }>(
    `
      SELECT
        COALESCE(SUM("totalTokens"), 0)::text AS total_tokens,
        COALESCE(SUM("costUsd"), 0)::text AS cost_usd,
        COUNT(*)::text AS request_count
      FROM "UsageEvent" WHERE "orgId" = $1 AND "userId" = $2
    `,
    [orgId, userId]
  );
  const row = result.rows[0];
  return {
    totalTokens: Number(row?.total_tokens ?? 0),
    costUsd: Number(row?.cost_usd ?? 0),
    requestCount: Number(row?.request_count ?? 0)
  };
}

export async function listRecentUsageForUser(db: Db, orgId: string, userId: string, limit: number) {
  const result = await db.query(`SELECT * FROM "UsageEvent" WHERE "orgId" = $1 AND "userId" = $2 ORDER BY "createdAt" DESC LIMIT $3`, [
    orgId,
    userId,
    limit
  ]);
  return result.rows.map(mapUsageEvent);
}

export async function listRecentUsageEvents(db: Db, orgId: string, limit: number) {
  const result = await db.query(`SELECT * FROM "UsageEvent" WHERE "orgId" = $1 ORDER BY "createdAt" DESC LIMIT $2`, [orgId, limit]);
  return result.rows.map(mapUsageEvent);
}

export async function summarizeUsageTotals(db: Db, whereSql: string, params: unknown[]) {
  const result = await db.query<{
    total_tokens: string;
    cost_usd: string;
    request_count: string;
  }>(
    `
      SELECT
        COALESCE(SUM("totalTokens"), 0)::text AS total_tokens,
        COALESCE(SUM("costUsd"), 0)::text AS cost_usd,
        COUNT(*)::text AS request_count
      FROM "UsageEvent" WHERE ${whereSql}
    `,
    params
  );
  const row = result.rows[0];
  return {
    totalTokens: Number(row?.total_tokens ?? 0),
    costUsd: Number(row?.cost_usd ?? 0),
    requestCount: Number(row?.request_count ?? 0)
  };
}

export async function summarizeUsageGroupBy(
  db: Db,
  column: "source" | "category" | "provider",
  whereSql: string,
  params: unknown[]
) {
  const result = await db.query<{
    key: string;
    total_tokens: string;
    cost_usd: string;
    request_count: string;
  }>(
    `
      SELECT "${column}" AS key,
        COALESCE(SUM("totalTokens"), 0)::text AS total_tokens,
        COALESCE(SUM("costUsd"), 0)::text AS cost_usd,
        COUNT(*)::text AS request_count
      FROM "UsageEvent" WHERE ${whereSql}
      GROUP BY "${column}"
      ORDER BY SUM("costUsd") DESC
    `,
    params
  );
  return result.rows.map((row) => ({
    key: row.key,
    totalTokens: Number(row.total_tokens ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    requestCount: Number(row.request_count ?? 0)
  }));
}

export async function dashboardAggregateTotals(db: Db, orgId: string) {
  const result = await db.query<{
    total_tokens: string;
    cost_usd: string;
    request_count: string;
  }>(
    `
      SELECT
        COALESCE(SUM("totalTokens"), 0)::text AS total_tokens,
        COALESCE(SUM("costUsd"), 0)::text AS cost_usd,
        COALESCE(SUM("requestCount"), 0)::text AS request_count
      FROM "UsageAggregate" WHERE "orgId" = $1
    `,
    [orgId]
  );
  const row = result.rows[0];
  return {
    totalTokens: Number(row?.total_tokens ?? 0),
    costUsd: Number(row?.cost_usd ?? 0),
    requestCount: Number(row?.request_count ?? 0)
  };
}

export async function dashboardTopUsageByCost(db: Db, orgId: string, limit: number) {
  const result = await db.query(
    `
      SELECT ua.*, u."fullName"
      FROM "UsageAggregate" ua
      LEFT JOIN "User" u ON u.id = ua."userId"
      WHERE ua."orgId" = $1
      ORDER BY ua."costUsd" DESC
      LIMIT $2
    `,
    [orgId, limit]
  );
  return result.rows.map((row) => ({
    ...mapUsageAggregate(row),
    fullName: row.fullName ? String(row.fullName) : null
  }));
}

export async function dashboardTopUsageByTokens(db: Db, orgId: string, limit: number) {
  const result = await db.query(`SELECT * FROM "UsageAggregate" WHERE "orgId" = $1 ORDER BY "totalTokens" DESC LIMIT $2`, [
    orgId,
    limit
  ]);
  return result.rows.map(mapUsageAggregate);
}

export async function dashboardUsageBySource(db: Db, orgId: string) {
  const result = await db.query(
    `
      SELECT source,
        COALESCE(SUM("totalTokens"), 0)::int AS total_tokens,
        COALESCE(SUM("costUsd"), 0) AS cost_usd,
        COUNT(*)::int AS request_count
      FROM "UsageEvent" WHERE "orgId" = $1
      GROUP BY source ORDER BY SUM("costUsd") DESC
    `,
    [orgId]
  );
  return result.rows;
}

export async function dashboardUsageByProvider(db: Db, orgId: string) {
  const result = await db.query(
    `
      SELECT provider,
        COALESCE(SUM("totalTokens"), 0)::int AS total_tokens,
        COALESCE(SUM("costUsd"), 0) AS cost_usd,
        COUNT(*)::int AS request_count
      FROM "UsageEvent" WHERE "orgId" = $1
      GROUP BY provider ORDER BY SUM("costUsd") DESC
    `,
    [orgId]
  );
  return result.rows;
}

export async function sumUsageCostForMonth(db: Db, orgId: string, monthBucket: Date) {
  const result = await db.query<{ cost_usd: string }>(
    `SELECT COALESCE(SUM("costUsd"), 0)::text AS cost_usd FROM "UsageAggregate" WHERE "orgId" = $1 AND "monthBucket" = $2`,
    [orgId, monthBucket]
  );
  return Number(result.rows[0]?.cost_usd ?? 0);
}

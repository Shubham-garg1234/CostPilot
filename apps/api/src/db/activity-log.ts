import type { AuthContext } from "../types.js";
import type { Db } from "./client.js";
import { createId } from "./id.js";
import { mapActivityLog } from "./mappers.js";
import type { ActivityLogRow } from "./types.js";

export type ActivityLogInput = {
  auth: AuthContext;
  eventType: string;
  eventCategory: string;
  status: string;
  outcomeReason?: string | null;
  source?: string | null;
  integrationType?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type ActivityLogFilters = {
  orgId: string;
  userId?: string;
  eventType?: string;
  eventCategory?: string;
  status?: string;
  source?: string;
  sessionId?: string;
  requestId?: string;
  since?: Date;
  limit?: number;
};

export async function insertActivityLog(db: Db, input: ActivityLogInput): Promise<ActivityLogRow> {
  const now = new Date();
  const result = await db.query(
    `
      INSERT INTO "ActivityLog" (
        "id", "eventType", "eventCategory", "status", "outcomeReason",
        "orgId", "userId", "teamId", "role", "source", "integrationType",
        "workspaceId", "sessionId", "requestId", "subjectType", "subjectId",
        "metadata", "occurredAt", "processedAt", "createdAt"
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
      RETURNING *
    `,
    [
      createId(),
      input.eventType,
      input.eventCategory,
      input.status,
      input.outcomeReason ?? null,
      input.auth.orgId,
      input.auth.userId ?? null,
      input.auth.teamId ?? null,
      input.auth.role ?? null,
      input.source ?? null,
      input.integrationType ?? null,
      input.workspaceId ?? null,
      input.sessionId ?? null,
      input.requestId ?? null,
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.occurredAt ?? now,
      now
    ]
  );

  return mapActivityLog(result.rows[0]);
}

export async function listActivityLogs(db: Db, filters: ActivityLogFilters): Promise<ActivityLogRow[]> {
  const { sql, params } = buildActivityLogWhere(filters);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const result = await db.query(
    `
      SELECT * FROM "ActivityLog"
      WHERE ${sql}
      ORDER BY "createdAt" DESC
      LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map(mapActivityLog);
}

export async function summarizeActivityLogs(db: Db, orgId: string, since: Date) {
  const [byType, byStatus, failures, promptEnhancement, quotaDecisions] = await Promise.all([
    db.query(
      `
        SELECT "eventType" AS key, COUNT(*)::int AS count
        FROM "ActivityLog"
        WHERE "orgId" = $1 AND "createdAt" >= $2
        GROUP BY "eventType"
        ORDER BY count DESC
      `,
      [orgId, since]
    ),
    db.query(
      `
        SELECT status AS key, COUNT(*)::int AS count
        FROM "ActivityLog"
        WHERE "orgId" = $1 AND "createdAt" >= $2
        GROUP BY status
        ORDER BY count DESC
      `,
      [orgId, since]
    ),
    db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM "ActivityLog"
        WHERE "orgId" = $1 AND "createdAt" >= $2 AND status IN ('failed', 'blocked')
      `,
      [orgId, since]
    ),
    db.query(
      `
        SELECT status AS key, COUNT(*)::int AS count
        FROM "ActivityLog"
        WHERE "orgId" = $1 AND "createdAt" >= $2 AND "eventType" LIKE 'prompt_enhancement.%'
        GROUP BY status
        ORDER BY count DESC
      `,
      [orgId, since]
    ),
    db.query(
      `
        SELECT status AS key, COUNT(*)::int AS count
        FROM "ActivityLog"
        WHERE "orgId" = $1 AND "createdAt" >= $2 AND "eventType" LIKE 'quota.%'
        GROUP BY status
        ORDER BY count DESC
      `,
      [orgId, since]
    )
  ]);

  return {
    byType: byType.rows,
    byStatus: byStatus.rows,
    failedOrBlockedCount: Number(failures.rows[0]?.count ?? 0),
    promptEnhancement: promptEnhancement.rows,
    quotaDecisions: quotaDecisions.rows
  };
}

export async function listAgentEvents(db: Db, filters: ActivityLogFilters): Promise<ActivityLogRow[]> {
  return listActivityLogs(db, {
    ...filters,
    eventCategory: "agent"
  });
}

export async function listPromptEnhancementEvents(db: Db, filters: ActivityLogFilters): Promise<ActivityLogRow[]> {
  const { sql, params } = buildActivityLogWhere(filters, `"eventType" LIKE 'prompt_enhancement.%'`);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const result = await db.query(
    `
      SELECT * FROM "ActivityLog"
      WHERE ${sql}
      ORDER BY "createdAt" DESC
      LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map(mapActivityLog);
}

export async function listQuotaDecisionEvents(db: Db, filters: ActivityLogFilters): Promise<ActivityLogRow[]> {
  const { sql, params } = buildActivityLogWhere(filters, `"eventType" LIKE 'quota.%'`);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const result = await db.query(
    `
      SELECT * FROM "ActivityLog"
      WHERE ${sql}
      ORDER BY "createdAt" DESC
      LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map(mapActivityLog);
}

export async function listToolFailureEvents(db: Db, filters: ActivityLogFilters): Promise<ActivityLogRow[]> {
  const { sql, params } = buildActivityLogWhere(filters, `"eventCategory" = 'tool' AND status = 'failed'`);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const result = await db.query(
    `
      SELECT * FROM "ActivityLog"
      WHERE ${sql}
      ORDER BY "createdAt" DESC
      LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map(mapActivityLog);
}

export async function summarizeAgentSessions(db: Db, orgId: string, since: Date, limit: number) {
  const result = await db.query(
    `
      SELECT
        "sessionId",
        MAX("source") AS source,
        MAX("integrationType") AS "integrationType",
        MIN("createdAt") AS "startedAt",
        MAX("createdAt") AS "lastActivityAt",
        COUNT(*)::int AS "activityCount",
        COUNT(*) FILTER (WHERE status IN ('failed', 'blocked'))::int AS "failedOrBlockedCount",
        COUNT(*) FILTER (WHERE "eventType" = 'agent.turn_completed')::int AS "completedTurns"
      FROM "ActivityLog"
      WHERE "orgId" = $1 AND "createdAt" >= $2 AND "sessionId" IS NOT NULL
      GROUP BY "sessionId"
      ORDER BY "lastActivityAt" DESC
      LIMIT $3
    `,
    [orgId, since, Math.min(Math.max(limit, 1), 500)]
  );

  return result.rows.map((row) => ({
    sessionId: String(row.sessionId),
    source: row.source ? String(row.source) : null,
    integrationType: row.integrationType ? String(row.integrationType) : null,
    startedAt: new Date(row.startedAt as string | Date),
    lastActivityAt: new Date(row.lastActivityAt as string | Date),
    activityCount: Number(row.activityCount ?? 0),
    failedOrBlockedCount: Number(row.failedOrBlockedCount ?? 0),
    completedTurns: Number(row.completedTurns ?? 0),
    stale: Number(row.completedTurns ?? 0) === 0 || Number(row.failedOrBlockedCount ?? 0) > 0
  }));
}

function buildActivityLogWhere(filters: ActivityLogFilters, extraClause?: string) {
  const clauses = [`"orgId" = $1`];
  const params: unknown[] = [filters.orgId];
  let index = 2;

  if (filters.userId) {
    clauses.push(`"userId" = $${index++}`);
    params.push(filters.userId);
  }
  if (filters.eventType) {
    clauses.push(`"eventType" = $${index++}`);
    params.push(filters.eventType);
  }
  if (filters.eventCategory) {
    clauses.push(`"eventCategory" = $${index++}`);
    params.push(filters.eventCategory);
  }
  if (filters.status) {
    clauses.push(`status = $${index++}`);
    params.push(filters.status);
  }
  if (filters.source) {
    clauses.push(`source = $${index++}`);
    params.push(filters.source);
  }
  if (filters.sessionId) {
    clauses.push(`"sessionId" = $${index++}`);
    params.push(filters.sessionId);
  }
  if (filters.requestId) {
    clauses.push(`"requestId" = $${index++}`);
    params.push(filters.requestId);
  }
  if (filters.since) {
    clauses.push(`"createdAt" >= $${index++}`);
    params.push(filters.since);
  }
  if (extraClause) {
    clauses.push(extraClause);
  }

  return { sql: clauses.join(" AND "), params };
}

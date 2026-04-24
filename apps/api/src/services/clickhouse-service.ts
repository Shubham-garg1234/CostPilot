import type { FastifyInstance } from "fastify";
import type { ClickHouseClientLike, UsageEventInput } from "../types.js";

type ClickHouseEnv = {
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  CLICKHOUSE_DATABASE: string;
};

export async function createClickHouseClient(
  env: ClickHouseEnv,
  app?: FastifyInstance
): Promise<ClickHouseClientLike> {
  const endpoint = new URL(env.CLICKHOUSE_URL);
  const database = env.CLICKHOUSE_DATABASE;
  const baseHeaders = buildHeaders(env);

  return {
    async ping() {
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: baseHeaders
      });

      if (!response.ok) {
        throw new Error(`ClickHouse ping failed with status ${response.status}`);
      }
    },
    async ensureSchema() {
      await ensureAnalyticsTable(endpoint, database, baseHeaders, app);
    },
    async insertUsageEvent(payload) {
      await ensureAnalyticsTable(endpoint, database, baseHeaders, app);
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json"
        },
        body: `INSERT INTO ${database}.usage_events FORMAT JSONEachRow\n${JSON.stringify(formatPayload(payload))}`
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`ClickHouse insert failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
      }
    }
  };
}

let analyticsTableReady = false;

async function ensureAnalyticsTable(
  endpoint: URL,
  database: string,
  headers: HeadersInit,
  app?: FastifyInstance
) {
  if (analyticsTableReady) {
    return;
  }

  const createDatabaseQuery = `CREATE DATABASE IF NOT EXISTS ${database}`;
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${database}.usage_events (
      request_id Nullable(String),
      org_id String,
      user_id Nullable(String),
      team_id Nullable(String),
      role Nullable(String),
      source String,
      integration_type String,
      workspace_id Nullable(String),
      session_id Nullable(String),
      category String,
      feature Nullable(String),
      provider String,
      model String,
      status String,
      prompt_tokens UInt32,
      completion_tokens UInt32,
      total_tokens UInt32,
      cost_usd Float64,
      started_at Nullable(DateTime64(3)),
      completed_at Nullable(DateTime64(3)),
      created_at DateTime64(3),
      metadata String
    )
    ENGINE = MergeTree
    ORDER BY (org_id, created_at, provider, model);
  `;

  const createDatabaseResponse = await fetch(endpoint.toString(), {
    method: "POST",
    headers,
    body: createDatabaseQuery
  });

  if (!createDatabaseResponse.ok) {
    const detail = await createDatabaseResponse.text().catch(() => "");
    throw new Error(
      `ClickHouse database init failed with status ${createDatabaseResponse.status}${detail ? `: ${detail}` : ""}`
    );
  }

  const createTableResponse = await fetch(endpoint.toString(), {
    method: "POST",
    headers,
    body: createTableQuery
  });

  if (!createTableResponse.ok) {
    const detail = await createTableResponse.text().catch(() => "");
    throw new Error(
      `ClickHouse schema init failed with status ${createTableResponse.status}${detail ? `: ${detail}` : ""}`
    );
  }

  analyticsTableReady = true;
  app?.log.info("ClickHouse analytics table ready");
}

function buildHeaders(env: ClickHouseEnv) {
  const headers: Record<string, string> = {
    "X-ClickHouse-Database": env.CLICKHOUSE_DATABASE,
    "X-ClickHouse-User": env.CLICKHOUSE_USERNAME
  };

  if (env.CLICKHOUSE_PASSWORD) {
    headers["X-ClickHouse-Key"] = env.CLICKHOUSE_PASSWORD;
  }

  return headers;
}

function formatPayload(payload: UsageEventInput) {
  return {
    request_id: payload.requestId ?? null,
    org_id: payload.auth.orgId,
    user_id: payload.auth.userId ?? null,
    team_id: payload.auth.teamId ?? null,
    role: payload.auth.role ?? null,
    source: payload.source,
    integration_type: payload.integrationType,
    workspace_id: payload.workspaceId ?? null,
    session_id: payload.sessionId ?? null,
    category: payload.category,
    feature: payload.feature ?? null,
    provider: payload.provider,
    model: payload.model,
    status: payload.status,
    prompt_tokens: payload.promptTokens,
    completion_tokens: payload.completionTokens,
    total_tokens: payload.totalTokens,
    cost_usd: payload.costUsd,
    started_at: payload.startedAt?.toISOString() ?? null,
    completed_at: payload.completedAt?.toISOString() ?? null,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify(payload.metadata ?? {})
  };
}

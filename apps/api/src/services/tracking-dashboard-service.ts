import type { Db } from "../db/client.js";
import { summarizeActivityLogs, summarizeAgentSessions } from "../db/activity-log.js";
import { dashboardTopSessionsByCost, dashboardUsageBySource } from "../db/usage.js";
import { decimalNumber } from "../db/mappers.js";
import type { UsageSource } from "../db/types.js";
import { serializeUsageSource } from "./usage-source.js";

export async function buildTrackingDashboardInsights(db: Db, orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    activitySummary,
    sessions,
    topSessions,
    sourceBreakdown,
    trackingBlocked,
    promptRequested,
    agentTurns
  ] = await Promise.all([
    summarizeActivityLogs(db, orgId, since),
    summarizeAgentSessions(db, orgId, since, 50),
    dashboardTopSessionsByCost(db, orgId, 10),
    dashboardUsageBySource(db, orgId),
    countActivityByType(db, orgId, since, "usage.tracking_blocked"),
    countActivityByType(db, orgId, since, "prompt_enhancement.requested"),
    countActivityByType(db, orgId, since, "agent.turn_completed")
  ]);

  const staleSessions = sessions.filter((session) => session.stale);
  const blockedWork = activitySummary.failedOrBlockedCount;
  const promptEnhancementAdoption =
    agentTurns > 0 ? Number(((promptRequested / agentTurns) * 100).toFixed(1)) : promptRequested > 0 ? 100 : 0;

  return {
    rangeDays: days,
    layers: {
      rawActivityLog: "ActivityLog",
      curatedInsights: "admin-insights datasets",
      dashboards: "dashboard/tracking-insights"
    },
    failedOrBlockedCount: blockedWork,
    failedTrackingEvents: trackingBlocked,
    promptEnhancementRequests: promptRequested,
    completedAgentTurns: agentTurns,
    promptEnhancementAdoptionPercent: promptEnhancementAdoption,
    staleSessionCount: staleSessions.length,
    incompleteSessions: staleSessions.slice(0, 10),
    highestCostSessions: topSessions.map((row) => ({
      sessionId: row.sessionId,
      source: row.source ? serializeUsageSource(row.source as UsageSource) : null,
      costUsd: decimalNumber(row.costUsd),
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
      lastSeenAt: row.lastSeenAt
    })),
    usageBySource: sourceBreakdown.map((entry) => ({
      source: serializeUsageSource(entry.source as UsageSource),
      costUsd: decimalNumber(entry.cost_usd),
      tokens: entry.total_tokens ?? 0,
      requests: entry.request_count ?? 0
    })),
    activityByType: activitySummary.byType,
    activityByStatus: activitySummary.byStatus
  };
}

async function countActivityByType(db: Db, orgId: string, since: Date, eventType: string) {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM "ActivityLog"
      WHERE "orgId" = $1 AND "createdAt" >= $2 AND "eventType" = $3
    `,
    [orgId, since, eventType]
  );
  return Number(result.rows[0]?.count ?? 0);
}

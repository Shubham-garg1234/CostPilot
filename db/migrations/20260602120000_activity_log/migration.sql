CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCategory" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcomeReason" TEXT,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "role" "RoleKey",
    "source" TEXT,
    "integrationType" TEXT,
    "workspaceId" TEXT,
    "sessionId" TEXT,
    "requestId" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_createdAt_idx" ON "ActivityLog"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_eventType_createdAt_idx" ON "ActivityLog"("orgId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_status_createdAt_idx" ON "ActivityLog"("orgId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_source_createdAt_idx" ON "ActivityLog"("orgId", "source", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_sessionId_createdAt_idx" ON "ActivityLog"("orgId", "sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_orgId_requestId_idx" ON "ActivityLog"("orgId", "requestId");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ADMIN', 'MANAGER', 'SDE1', 'SDE2', 'INTERN');

-- CreateEnum
CREATE TYPE "ViolationAction" AS ENUM ('BLOCK', 'WARN', 'THROTTLE');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('TOKEN_LIMIT', 'REQUEST_LIMIT', 'COST_LIMIT', 'MODEL_RESTRICTED', 'FEATURE_LOCKED', 'CATEGORY_LOCKED', 'TEMP_BAN');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('SDK', 'CURSOR', 'CHROME_EXTENSION', 'COPILOT', 'CLAUDE', 'CODEX', 'MCP', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('PROXY', 'MCP', 'EXTENSION', 'DIRECT', 'IMPORT', 'OBSERVABILITY');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "monthlyBudgetUsd" DECIMAL(12,2),
    "markupPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentCode" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT,
    "role" "RoleKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "RoleKey" NOT NULL,
    "category" TEXT NOT NULL,
    "feature" TEXT,
    "maxTokensPerDay" INTEGER,
    "maxRequestsPerHour" INTEGER,
    "maxCostPerMonthUsd" DECIMAL(12,2),
    "allowedModels" TEXT[],
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    "featureLocked" BOOLEAN NOT NULL DEFAULT false,
    "actionOnViolation" "ViolationAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleKey" NOT NULL,
    "category" TEXT NOT NULL,
    "feature" TEXT,
    "model" TEXT NOT NULL,
    "type" "ViolationType" NOT NULL,
    "actionTaken" "ViolationAction" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "role" "RoleKey",
    "source" "UsageSource" NOT NULL DEFAULT 'SDK',
    "integrationType" "IntegrationType" NOT NULL DEFAULT 'PROXY',
    "workspaceId" TEXT,
    "sessionId" TEXT,
    "category" TEXT NOT NULL,
    "feature" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageAggregate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "role" "RoleKey",
    "source" "UsageSource" NOT NULL DEFAULT 'SDK',
    "integrationType" "IntegrationType" NOT NULL DEFAULT 'PROXY',
    "workspaceId" TEXT,
    "sessionId" TEXT,
    "dayBucket" TIMESTAMP(3) NOT NULL,
    "hourBucket" TIMESTAMP(3),
    "monthBucket" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "feature" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rawCostUsd" DECIMAL(12,4) NOT NULL,
    "markupPercentage" DECIMAL(5,2) NOT NULL,
    "finalCostUsd" DECIMAL(12,4) NOT NULL,
    "stripeInvoiceId" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Policy_orgId_role_category_feature_idx" ON "Policy"("orgId", "role", "category", "feature");

-- CreateIndex
CREATE INDEX "Violation_orgId_createdAt_idx" ON "Violation"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Violation_userId_createdAt_idx" ON "Violation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_requestId_key" ON "UsageEvent"("requestId");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_createdAt_idx" ON "UsageEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_teamId_createdAt_idx" ON "UsageEvent"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_source_createdAt_idx" ON "UsageEvent"("orgId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_category_createdAt_idx" ON "UsageEvent"("orgId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "UsageAggregate_orgId_dayBucket_idx" ON "UsageAggregate"("orgId", "dayBucket");

-- CreateIndex
CREATE INDEX "UsageAggregate_userId_dayBucket_idx" ON "UsageAggregate"("userId", "dayBucket");

-- CreateIndex
CREATE INDEX "UsageAggregate_teamId_dayBucket_idx" ON "UsageAggregate"("teamId", "dayBucket");

-- CreateIndex
CREATE INDEX "UsageAggregate_orgId_source_dayBucket_idx" ON "UsageAggregate"("orgId", "source", "dayBucket");

-- CreateIndex
CREATE INDEX "BillingRecord_orgId_periodStart_periodEnd_idx" ON "BillingRecord"("orgId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageAggregate" ADD CONSTRAINT "UsageAggregate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageAggregate" ADD CONSTRAINT "UsageAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageAggregate" ADD CONSTRAINT "UsageAggregate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRecord" ADD CONSTRAINT "BillingRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

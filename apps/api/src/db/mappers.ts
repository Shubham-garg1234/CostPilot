import type {
  BillingRecordRow,
  OrganizationRow,
  PolicyRow,
  TeamRow,
  UsageAggregateRow,
  UsageEventRow,
  UserRow,
  ViolationRow
} from "./types.js";

type PgRow = Record<string, unknown>;

export function mapOrganization(row: PgRow): OrganizationRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    stripeCustomerId: row.stripeCustomerId ? String(row.stripeCustomerId) : null,
    monthlyBudgetUsd: row.monthlyBudgetUsd != null ? String(row.monthlyBudgetUsd) : null,
    markupPercentage: String(row.markupPercentage ?? "0"),
    createdAt: new Date(row.createdAt as string | Date),
    updatedAt: new Date(row.updatedAt as string | Date)
  };
}

export function mapTeam(row: PgRow): TeamRow {
  return {
    id: String(row.id),
    name: String(row.name),
    departmentCode: row.departmentCode ? String(row.departmentCode) : null,
    organizationId: String(row.organizationId)
  };
}

export function mapUser(row: PgRow): UserRow {
  return {
    id: String(row.id),
    clerkUserId: row.clerkUserId ? String(row.clerkUserId) : null,
    email: String(row.email),
    fullName: String(row.fullName),
    organizationId: String(row.organizationId),
    teamId: row.teamId ? String(row.teamId) : null,
    managerId: row.managerId ? String(row.managerId) : null,
    role: row.role as UserRow["role"],
    passwordHash: row.passwordHash ? String(row.passwordHash) : null,
    passwordSetAt: row.passwordSetAt ? new Date(row.passwordSetAt as string | Date) : null,
    createdAt: new Date(row.createdAt as string | Date),
    updatedAt: new Date(row.updatedAt as string | Date)
  };
}

export function mapPolicy(row: PgRow): PolicyRow {
  return {
    id: String(row.id),
    orgId: String(row.orgId),
    role: row.role as PolicyRow["role"],
    category: String(row.category),
    feature: row.feature ? String(row.feature) : null,
    maxTokensPerDay: row.maxTokensPerDay != null ? Number(row.maxTokensPerDay) : null,
    maxRequestsPerHour: row.maxRequestsPerHour != null ? Number(row.maxRequestsPerHour) : null,
    maxCostPerMonthUsd: row.maxCostPerMonthUsd != null ? String(row.maxCostPerMonthUsd) : null,
    allowedModels: Array.isArray(row.allowedModels) ? row.allowedModels.map(String) : [],
    disabled: Boolean(row.disabled),
    cooldownMinutes: Number(row.cooldownMinutes),
    featureLocked: Boolean(row.featureLocked),
    actionOnViolation: row.actionOnViolation as PolicyRow["actionOnViolation"],
    createdAt: new Date(row.createdAt as string | Date),
    updatedAt: new Date(row.updatedAt as string | Date)
  };
}

export function mapUsageEvent(row: PgRow): UsageEventRow {
  return {
    id: String(row.id),
    requestId: row.requestId ? String(row.requestId) : null,
    orgId: String(row.orgId),
    userId: row.userId ? String(row.userId) : null,
    teamId: row.teamId ? String(row.teamId) : null,
    role: row.role ? (row.role as UsageEventRow["role"]) : null,
    source: row.source as UsageEventRow["source"],
    integrationType: row.integrationType as UsageEventRow["integrationType"],
    workspaceId: row.workspaceId ? String(row.workspaceId) : null,
    sessionId: row.sessionId ? String(row.sessionId) : null,
    category: String(row.category),
    feature: row.feature ? String(row.feature) : null,
    provider: String(row.provider),
    model: String(row.model),
    status: String(row.status),
    promptTokens: Number(row.promptTokens),
    completionTokens: Number(row.completionTokens),
    totalTokens: Number(row.totalTokens),
    costUsd: String(row.costUsd),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    startedAt: row.startedAt ? new Date(row.startedAt as string | Date) : null,
    completedAt: row.completedAt ? new Date(row.completedAt as string | Date) : null,
    createdAt: new Date(row.createdAt as string | Date)
  };
}

export function mapUsageAggregate(row: PgRow): UsageAggregateRow {
  return {
    id: String(row.id),
    orgId: String(row.orgId),
    userId: row.userId ? String(row.userId) : null,
    teamId: row.teamId ? String(row.teamId) : null,
    role: row.role ? (row.role as UsageAggregateRow["role"]) : null,
    source: row.source as UsageAggregateRow["source"],
    integrationType: row.integrationType as UsageAggregateRow["integrationType"],
    workspaceId: row.workspaceId ? String(row.workspaceId) : null,
    sessionId: row.sessionId ? String(row.sessionId) : null,
    dayBucket: new Date(row.dayBucket as string | Date),
    hourBucket: row.hourBucket ? new Date(row.hourBucket as string | Date) : null,
    monthBucket: new Date(row.monthBucket as string | Date),
    category: String(row.category),
    feature: row.feature ? String(row.feature) : null,
    provider: String(row.provider),
    model: String(row.model),
    promptTokens: Number(row.promptTokens),
    completionTokens: Number(row.completionTokens),
    totalTokens: Number(row.totalTokens),
    requestCount: Number(row.requestCount),
    costUsd: String(row.costUsd),
    createdAt: new Date(row.createdAt as string | Date),
    updatedAt: new Date(row.updatedAt as string | Date)
  };
}

export function mapViolation(row: PgRow): ViolationRow {
  return {
    id: String(row.id),
    orgId: String(row.orgId),
    userId: String(row.userId),
    role: row.role as ViolationRow["role"],
    category: String(row.category),
    feature: row.feature ? String(row.feature) : null,
    model: String(row.model),
    type: row.type as ViolationRow["type"],
    actionTaken: row.actionTaken as ViolationRow["actionTaken"],
    message: String(row.message),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(row.createdAt as string | Date)
  };
}

export function mapBillingRecord(row: PgRow): BillingRecordRow {
  return {
    id: String(row.id),
    orgId: String(row.orgId),
    periodStart: new Date(row.periodStart as string | Date),
    periodEnd: new Date(row.periodEnd as string | Date),
    rawCostUsd: String(row.rawCostUsd),
    markupPercentage: String(row.markupPercentage),
    finalCostUsd: String(row.finalCostUsd),
    stripeInvoiceId: row.stripeInvoiceId ? String(row.stripeInvoiceId) : null,
    status: row.status as BillingRecordRow["status"],
    createdAt: new Date(row.createdAt as string | Date)
  };
}

export function decimalNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

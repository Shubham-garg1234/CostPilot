export const RoleKey = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SDE1: "SDE1",
  SDE2: "SDE2",
  INTERN: "INTERN"
} as const;

export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const roleKeyValues = Object.values(RoleKey) as [RoleKey, ...RoleKey[]];

export const ViolationAction = {
  BLOCK: "BLOCK",
  WARN: "WARN",
  THROTTLE: "THROTTLE"
} as const;

export type ViolationAction = (typeof ViolationAction)[keyof typeof ViolationAction];

export const violationActionValues = Object.values(ViolationAction) as [ViolationAction, ...ViolationAction[]];

export const ViolationType = {
  TOKEN_LIMIT: "TOKEN_LIMIT",
  REQUEST_LIMIT: "REQUEST_LIMIT",
  COST_LIMIT: "COST_LIMIT",
  MODEL_RESTRICTED: "MODEL_RESTRICTED",
  FEATURE_LOCKED: "FEATURE_LOCKED",
  CATEGORY_LOCKED: "CATEGORY_LOCKED",
  TEMP_BAN: "TEMP_BAN"
} as const;

export type ViolationType = (typeof ViolationType)[keyof typeof ViolationType];

export const BillingStatus = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  PAID: "PAID",
  VOID: "VOID"
} as const;

export type BillingStatus = (typeof BillingStatus)[keyof typeof BillingStatus];

export const UsageSource = {
  SDK: "SDK",
  CURSOR: "CURSOR",
  CHROME_EXTENSION: "CHROME_EXTENSION",
  COPILOT: "COPILOT",
  CLAUDE: "CLAUDE",
  CODEX: "CODEX",
  MCP: "MCP",
  OTHER: "OTHER"
} as const;

export type UsageSource = (typeof UsageSource)[keyof typeof UsageSource];

export const IntegrationType = {
  PROXY: "PROXY",
  MCP: "MCP",
  EXTENSION: "EXTENSION",
  DIRECT: "DIRECT",
  IMPORT: "IMPORT",
  OBSERVABILITY: "OBSERVABILITY"
} as const;

export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType];

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId: string | null;
  monthlyBudgetUsd: string | null;
  markupPercentage: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamRow = {
  id: string;
  name: string;
  departmentCode: string | null;
  organizationId: string;
};

export type UserRow = {
  id: string;
  clerkUserId: string | null;
  email: string;
  fullName: string;
  organizationId: string;
  teamId: string | null;
  managerId: string | null;
  role: RoleKey;
  passwordHash: string | null;
  passwordSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PolicyRow = {
  id: string;
  orgId: string;
  role: RoleKey;
  category: string;
  feature: string | null;
  maxTokensPerDay: number | null;
  maxRequestsPerHour: number | null;
  maxCostPerMonthUsd: string | null;
  allowedModels: string[];
  disabled: boolean;
  cooldownMinutes: number;
  featureLocked: boolean;
  actionOnViolation: ViolationAction;
  createdAt: Date;
  updatedAt: Date;
};

export type UsageEventRow = {
  id: string;
  requestId: string | null;
  orgId: string;
  userId: string | null;
  teamId: string | null;
  role: RoleKey | null;
  source: UsageSource;
  integrationType: IntegrationType;
  workspaceId: string | null;
  sessionId: string | null;
  category: string;
  feature: string | null;
  provider: string;
  model: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: string;
  metadata: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type UsageAggregateRow = {
  id: string;
  orgId: string;
  userId: string | null;
  teamId: string | null;
  role: RoleKey | null;
  source: UsageSource;
  integrationType: IntegrationType;
  workspaceId: string | null;
  sessionId: string | null;
  dayBucket: Date;
  hourBucket: Date | null;
  monthBucket: Date;
  category: string;
  feature: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  costUsd: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ViolationRow = {
  id: string;
  orgId: string;
  userId: string;
  role: RoleKey;
  category: string;
  feature: string | null;
  model: string;
  type: ViolationType;
  actionTaken: ViolationAction;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type BillingRecordRow = {
  id: string;
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  rawCostUsd: string;
  markupPercentage: string;
  finalCostUsd: string;
  stripeInvoiceId: string | null;
  status: BillingStatus;
  createdAt: Date;
};

export type CreatePolicyInput = {
  orgId: string;
  role: RoleKey;
  category: string;
  feature: string | null;
  maxTokensPerDay: number | null;
  maxRequestsPerHour: number | null;
  maxCostPerMonthUsd: number | null;
  allowedModels: string[];
  actionOnViolation: ViolationAction;
  cooldownMinutes: number;
  featureLocked: boolean;
};

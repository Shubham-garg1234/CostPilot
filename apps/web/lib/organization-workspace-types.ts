export type DashboardSummary = {
  metrics: Array<{ label: string; value: string; trend: string }>;
  topUsers: Array<{ id: string; name: string; role: string; category: string; costUsd: number; tokens: number; source?: string }>;
  topFeatures: Array<{ feature: string; category: string; costUsd: number; tokens: number; provider?: string; source?: string }>;
  sourceBreakdown: Array<{ source: string; costUsd: number; tokens: number; requests: number }>;
  providerBreakdown: Array<{ provider: string; costUsd: number; tokens: number; requests: number }>;
  recentViolations: Array<{ id: string; type: string; message: string; createdAt: string; actionTaken: string; role: string }>;
};

export type OrganizationSnapshot = {
  organization: { id: string; name: string; slug: string; createdAt: string };
  teams: Array<{ id: string; name: string; departmentCode?: string | null; userCount: number }>;
  users: Array<{ id: string; email: string; name: string; role: string; teamId?: string | null; hasPassword: boolean }>;
  policies: Array<{ id: string }>;
};

export type PolicyRecord = {
  id: string;
  role: string;
  category: string;
  feature?: string | null;
  allowedModels: string[];
  actionOnViolation: string;
  maxRequestsPerHour?: number | null;
  maxTokensPerDay?: number | null;
};

export type BillingRecord = {
  id: string;
  periodStart: string;
  rawCostUsd: number;
  markupPercentage: number;
  finalCostUsd: number;
  status: string;
};

export type BillingResponse = {
  records: BillingRecord[];
};

export type WorkspaceLoadStatus = "idle" | "loading" | "ready" | "error";

export type WorkspaceSlice<T> = {
  data: T | null;
  status: WorkspaceLoadStatus;
  error: string;
};

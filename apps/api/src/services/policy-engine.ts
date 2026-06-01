import type { FastifyInstance } from "fastify";
import { createViolation as createViolationRow, findActivePoliciesForEvaluation } from "../db/index.js";
import { ViolationAction, ViolationType, type PolicyRow } from "../db/types.js";
import type { AuthContext, LlmProxyRequest, PolicyDecision } from "../types.js";
import { getUsageSnapshot, registerViolation } from "./usage-counter-service.js";

type PolicyLike = Pick<
  PolicyRow,
  | "orgId"
  | "role"
  | "category"
  | "feature"
  | "maxTokensPerDay"
  | "maxRequestsPerHour"
  | "maxCostPerMonthUsd"
  | "allowedModels"
  | "disabled"
  | "cooldownMinutes"
  | "featureLocked"
  | "actionOnViolation"
>;

function matchesPolicy(policy: PolicyLike, request: LlmProxyRequest, auth: AuthContext) {
  return (
    policy.orgId === auth.orgId &&
    policy.role === auth.role &&
    policy.category === request.category &&
    (policy.feature === null || policy.feature === request.feature)
  );
}

export async function resolvePolicy(app: FastifyInstance, auth: AuthContext, request: LlmProxyRequest) {
  if (!app.db) {
    throw new Error("PostgreSQL is unavailable.");
  }

  const policies = await findActivePoliciesForEvaluation(app.db, {
    orgId: auth.orgId,
    role: auth.role,
    category: request.category
  }).catch(() => []);

  return policies.find((policy) => matchesPolicy(policy, request, auth)) ?? null;
}

export async function evaluatePolicy(
  app: FastifyInstance,
  auth: AuthContext,
  request: LlmProxyRequest
): Promise<PolicyDecision> {
  const policy = await resolvePolicy(app, auth, request);

  if (!policy) {
    return { allowed: true, action: "allow" };
  }

  if (policy.featureLocked) {
    await createPolicyViolation(app, auth, request, policy.actionOnViolation, ViolationType.FEATURE_LOCKED, "Feature is locked for this role.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Feature is locked for this role.");
  }

  if (policy.allowedModels.length > 0 && !policy.allowedModels.includes(request.model)) {
    await createPolicyViolation(app, auth, request, policy.actionOnViolation, ViolationType.MODEL_RESTRICTED, "Selected model is not allowed for this role.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Selected model is not allowed for this role.");
  }

  const snapshot = await getUsageSnapshot(app, auth, request.category, request.feature);

  if (snapshot.cooldownUntil && snapshot.cooldownUntil > Date.now()) {
    await createPolicyViolation(app, auth, request, ViolationAction.BLOCK, ViolationType.CATEGORY_LOCKED, "Category is temporarily locked due to repeated abuse.", policy.cooldownMinutes);
    return { allowed: false, action: "block", reason: "Category is temporarily locked due to repeated abuse." };
  }

  if (policy.maxTokensPerDay !== null && snapshot.tokensUsedToday >= policy.maxTokensPerDay) {
    await createPolicyViolation(app, auth, request, policy.actionOnViolation, ViolationType.TOKEN_LIMIT, "Daily token quota exceeded.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Daily token quota exceeded.", snapshot.violationCount);
  }

  if (policy.maxRequestsPerHour !== null && snapshot.requestsThisHour >= policy.maxRequestsPerHour) {
    await createPolicyViolation(app, auth, request, policy.actionOnViolation, ViolationType.REQUEST_LIMIT, "Hourly request quota exceeded.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Hourly request quota exceeded.", snapshot.violationCount);
  }

  if (policy.maxCostPerMonthUsd !== null && snapshot.costThisMonthUsd >= Number(policy.maxCostPerMonthUsd)) {
    await createPolicyViolation(app, auth, request, policy.actionOnViolation, ViolationType.COST_LIMIT, "Monthly cost budget exceeded.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Monthly cost budget exceeded.", snapshot.violationCount);
  }

  if (snapshot.violationCount >= 3 && policy.cooldownMinutes > 0) {
    await registerViolation(app, auth, request.category, request.feature, policy.cooldownMinutes * 2);
    return { allowed: false, action: "block", reason: "Temporary ban applied after repeated policy violations." };
  }

  return { allowed: true, action: "allow" };
}

function toDecision(action: ViolationAction, reason: string, violationCount = 0): PolicyDecision {
  if (action === ViolationAction.BLOCK) {
    return { allowed: false, action: "block", reason };
  }

  if (action === ViolationAction.WARN) {
    return { allowed: true, action: "warn", warning: reason };
  }

  const throttleMs = Math.min(30_000, 2_000 * Math.max(1, violationCount + 1));
  return { allowed: true, action: "throttle", warning: reason, throttleMs };
}

export async function createPolicyViolation(
  app: FastifyInstance,
  auth: AuthContext,
  request: LlmProxyRequest,
  actionTaken: ViolationAction,
  type: ViolationType,
  message: string,
  cooldownMinutes: number
) {
  if (!app.db) {
    await registerViolation(app, auth, request.category, request.feature, cooldownMinutes);
    return;
  }

  await createViolationRow(app.db, {
    orgId: auth.orgId,
    userId: auth.userId,
    role: auth.role,
    category: request.category,
    feature: request.feature,
    model: request.model,
    type,
    actionTaken,
    message,
    metadata: request.metadata
  }).catch(() => null);

  await registerViolation(app, auth, request.category, request.feature, cooldownMinutes);
}

import { Prisma, ViolationAction, ViolationType, type Policy } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { AuthContext, LlmProxyRequest, PolicyDecision } from "../types.js";
import { getUsageSnapshot, registerViolation } from "./usage-counter-service.js";

type PolicyLike = Pick<
  Policy,
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

const demoPolicies: PolicyLike[] = [
  {
    orgId: "acme-org",
    role: "INTERN",
    category: "code_generation",
    feature: "copilot",
    maxTokensPerDay: 0,
    maxRequestsPerHour: 0,
    maxCostPerMonthUsd: new Prisma.Decimal(0),
    allowedModels: ["gpt-4o-mini"],
    disabled: false,
    cooldownMinutes: 60,
    featureLocked: true,
    actionOnViolation: ViolationAction.BLOCK
  },
  {
    orgId: "acme-org",
    role: "SDE1",
    category: "email_generation",
    feature: "auto_reply",
    maxTokensPerDay: 10000,
    maxRequestsPerHour: 30,
    maxCostPerMonthUsd: new Prisma.Decimal(50),
    allowedModels: ["gpt-4o-mini", "gpt-4.1-mini"],
    disabled: false,
    cooldownMinutes: 15,
    featureLocked: false,
    actionOnViolation: ViolationAction.WARN
  },
  {
    orgId: "acme-org",
    role: "MANAGER",
    category: "chat",
    feature: null,
    maxTokensPerDay: 120000,
    maxRequestsPerHour: 250,
    maxCostPerMonthUsd: new Prisma.Decimal(400),
    allowedModels: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
    disabled: false,
    cooldownMinutes: 5,
    featureLocked: false,
    actionOnViolation: ViolationAction.THROTTLE
  }
];

function matchesPolicy(policy: PolicyLike, request: LlmProxyRequest, auth: AuthContext) {
  return (
    policy.orgId === auth.orgId &&
    policy.role === auth.role &&
    policy.category === request.category &&
    (policy.feature === null || policy.feature === request.feature)
  );
}

export async function resolvePolicy(
  app: FastifyInstance,
  auth: AuthContext,
  request: LlmProxyRequest
) {
  if (!app.prisma) {
    return demoPolicies.find((policy) => matchesPolicy(policy, request, auth)) ?? null;
  }

  const policies = await app.prisma.policy.findMany({
    where: {
      orgId: auth.orgId,
      role: auth.role,
      category: request.category,
      disabled: false
    },
    orderBy: { createdAt: "desc" }
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
    await createViolation(app, auth, request, policy.actionOnViolation, ViolationType.FEATURE_LOCKED, "Feature is locked for this role.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Feature is locked for this role.");
  }

  if (policy.allowedModels.length > 0 && !policy.allowedModels.includes(request.model)) {
    await createViolation(app, auth, request, policy.actionOnViolation, ViolationType.MODEL_RESTRICTED, "Selected model is not allowed for this role.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Selected model is not allowed for this role.");
  }

  const snapshot = await getUsageSnapshot(app, auth, request.category, request.feature);

  if (snapshot.cooldownUntil && snapshot.cooldownUntil > Date.now()) {
    await createViolation(app, auth, request, ViolationAction.BLOCK, ViolationType.CATEGORY_LOCKED, "Category is temporarily locked due to repeated abuse.", policy.cooldownMinutes);
    return { allowed: false, action: "block", reason: "Category is temporarily locked due to repeated abuse." };
  }

  if (policy.maxTokensPerDay !== null && snapshot.tokensUsedToday >= policy.maxTokensPerDay) {
    await createViolation(app, auth, request, policy.actionOnViolation, ViolationType.TOKEN_LIMIT, "Daily token quota exceeded.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Daily token quota exceeded.", snapshot.violationCount);
  }

  if (policy.maxRequestsPerHour !== null && snapshot.requestsThisHour >= policy.maxRequestsPerHour) {
    await createViolation(app, auth, request, policy.actionOnViolation, ViolationType.REQUEST_LIMIT, "Hourly request quota exceeded.", policy.cooldownMinutes);
    return toDecision(policy.actionOnViolation, "Hourly request quota exceeded.", snapshot.violationCount);
  }

  if (policy.maxCostPerMonthUsd !== null && snapshot.costThisMonthUsd >= Number(policy.maxCostPerMonthUsd)) {
    await createViolation(app, auth, request, policy.actionOnViolation, ViolationType.COST_LIMIT, "Monthly cost budget exceeded.", policy.cooldownMinutes);
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

async function createViolation(
  app: FastifyInstance,
  auth: AuthContext,
  request: LlmProxyRequest,
  actionTaken: ViolationAction,
  type: ViolationType,
  message: string,
  cooldownMinutes: number
) {
  if (!app.prisma) {
    await registerViolation(app, auth, request.category, request.feature, cooldownMinutes);
    return;
  }

  await app.prisma.violation.create({
    data: {
      orgId: auth.orgId,
      userId: auth.userId,
      role: auth.role,
      category: request.category,
      feature: request.feature,
      model: request.model,
      type,
      actionTaken,
      message,
      metadata: request.metadata as Prisma.InputJsonValue | undefined
    }
  }).catch(() => null);

  await registerViolation(app, auth, request.category, request.feature, cooldownMinutes);
}

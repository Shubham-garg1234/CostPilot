import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { calculateCost } from "./costing.js";
import {
  createPendingUsageEvent,
  finalizeUsageEventSuccess,
  findUsageEventByRequestId,
  mirrorUsageEventToAnalytics,
  recordRequestWithoutUpstream,
  updateUsageEventStatus
} from "./analytics-service.js";
import { dispatchAlert } from "./notification-service.js";
import { generateOptimizationHints } from "./optimizer-service.js";
import { evaluatePolicy } from "./policy-engine.js";
import { commitUsage } from "./usage-counter-service.js";
import { generateResponse } from "../providers/index.js";
import { ProviderError } from "../providers/shared.js";
import type {
  AuthContext,
  LlmProxyRequest,
  UsageEventInput
} from "../types.js";
import {
  normalizeIntegrationType,
  normalizeUsageSource,
  serializeIntegrationType,
  serializeUsageSource
} from "./usage-source.js";

type ProviderName = "openai" | "anthropic" | "gemini";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ExecuteLlmRequestInput = {
  auth: AuthContext;
  request: LlmProxyRequest;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ExecuteLlmRequestResult = {
  requestId: string;
  provider: ProviderName;
  providerModel: string;
  model: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  warning?: string;
  enforcement: "allow" | "warn";
  analyticsStatus: "written" | "skipped";
  analyticsDetail?: string;
  optimizationHints: string[];
  source: ReturnType<typeof serializeUsageSource>;
  integrationType: ReturnType<typeof serializeIntegrationType>;
  replayed: boolean;
};

export class GovernedRequestError extends Error {
  constructor(
    message: string,
    readonly replyStatus: number,
    readonly status:
      | "blocked"
      | "throttled"
      | "tracking_failed"
      | "provider_error"
      | "duplicate_pending",
    readonly requestId: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "GovernedRequestError";
  }
}

export async function executeTrackedLlmRequest(
  app: FastifyInstance,
  input: ExecuteLlmRequestInput
): Promise<ExecuteLlmRequestResult> {
  const requestId = input.request.requestId?.trim() || randomUUID();
  const provider = input.request.provider ?? inferProvider(input.request.model);
  const source = normalizeUsageSource(input.request.source);
  const integrationType = normalizeIntegrationType(input.request.integrationType);
  const messages = input.messages?.length ? input.messages : [{ role: "user" as const, content: input.request.prompt }];
  const prompt = input.request.prompt.trim();
  const startedAt = input.request.startedAt ? new Date(input.request.startedAt) : new Date();

  const existing = await findExistingRequestOutcome(app, requestId, provider, input.request.model, source, integrationType);
  if (existing) {
    return existing;
  }

  const requestForPolicy: LlmProxyRequest = {
    ...input.request,
    requestId,
    provider
  };
  const decision = await evaluatePolicy(app, input.auth, requestForPolicy);

  if (!decision.allowed || decision.action === "throttle") {
    const reason = decision.allowed ? decision.warning ?? "Request has been throttled by policy." : decision.reason;
    try {
      await recordRequestWithoutUpstream(app, {
        auth: input.auth,
        provider,
        model: input.request.model,
        category: input.request.category,
        feature: input.request.feature,
        source,
        integrationType,
        workspaceId: input.request.workspaceId,
        sessionId: input.request.sessionId,
        requestId,
        status: "blocked",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        metadata: {
          ...(input.request.metadata ?? {}),
          policy: {
            action: decision.action,
            reason
          }
        },
        startedAt,
        completedAt: new Date()
      });
    } catch (error) {
      throw new GovernedRequestError(
        error instanceof Error ? error.message : "Unable to record blocked governed request.",
        500,
        "tracking_failed",
        requestId
      );
    }

    throw new GovernedRequestError(
      reason,
      decision.allowed ? 429 : 403,
      decision.allowed ? "throttled" : "blocked",
      requestId,
      decision.allowed ? decision.throttleMs : undefined
    );
  }

  let pendingEventId = "";

  try {
    const pendingEvent = await createPendingUsageEvent(app, {
      auth: input.auth,
      provider,
      model: input.request.model,
      category: input.request.category,
      feature: input.request.feature,
      source,
      integrationType,
      workspaceId: input.request.workspaceId,
      sessionId: input.request.sessionId,
      requestId,
      status: "pending",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      metadata: {
        ...(input.request.metadata ?? {}),
        gatewayRequest: {
          messageCount: messages.length,
          provider,
          model: input.request.model
        }
      },
      startedAt
    });

    pendingEventId = pendingEvent.id;
  } catch (error) {
    const duplicate = await findExistingRequestOutcome(app, requestId, provider, input.request.model, source, integrationType);
    if (duplicate) {
      return duplicate;
    }

    throw new GovernedRequestError(
      error instanceof Error ? error.message : "Unable to create pending governed usage record.",
      500,
      "tracking_failed",
      requestId
    );
  }

  let providerResponse;
  try {
    providerResponse = await generateResponse({
      provider,
      model: input.request.model,
      prompt,
      messages,
      metadata: input.request.metadata,
      temperature: input.temperature,
      maxTokens: input.maxTokens
    });
  } catch (error) {
    await safeUpdateUsageEventStatus(app, pendingEventId, {
      status: "provider_error",
      metadata: {
        providerError: {
          provider,
          message: error instanceof Error ? error.message : "Upstream provider request failed"
        }
      }
    });

    if (error instanceof ProviderError) {
      throw new GovernedRequestError(error.message, error.statusCode, "provider_error", requestId);
    }

    throw error;
  }

  const promptTokens = providerResponse.promptTokens;
  const completionTokens = providerResponse.completionTokens;
  const totalTokens = promptTokens + completionTokens;
  const cost = calculateCost(input.request.model, promptTokens, completionTokens);
  const completedAt = input.request.completedAt ? new Date(input.request.completedAt) : new Date();

  const usagePayload: UsageEventInput = {
    auth: input.auth,
    provider,
    model: input.request.model,
    category: input.request.category,
    feature: input.request.feature,
    source,
    integrationType,
    workspaceId: input.request.workspaceId,
    sessionId: input.request.sessionId,
    requestId,
    status: "success",
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: cost.totalCostUsd,
    metadata: {
      ...(input.request.metadata ?? {}),
      governedResponse: {
        output: providerResponse.output,
        providerModel: providerResponse.model
      }
    },
    startedAt,
    completedAt
  };

  try {
    await finalizeUsageEventSuccess(app, {
      eventId: pendingEventId,
      payload: usagePayload
    });
  } catch (error) {
    await safeUpdateUsageEventStatus(app, pendingEventId, {
      status: "tracking_failed",
      metadata: {
        trackingFailure: "Unable to finalize usage persistence after provider success."
      },
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: cost.totalCostUsd,
      completedAt
    });

    throw new GovernedRequestError(
      error instanceof Error ? error.message : "Unable to finalize governed usage persistence.",
      500,
      "tracking_failed",
      requestId
    );
  }

  try {
    await commitUsage(
      app,
      input.auth,
      input.request.category,
      input.request.feature,
      totalTokens,
      cost.totalCostUsd
    );
  } catch (error) {
    await safeUpdateUsageEventStatus(app, pendingEventId, {
      status: "tracking_failed",
      metadata: {
        trackingFailure: error instanceof Error ? error.message : "Usage counter update failed."
      },
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: cost.totalCostUsd,
      completedAt
    });

    throw new GovernedRequestError(
      error instanceof Error ? error.message : "Unable to update governed usage counters.",
      500,
      "tracking_failed",
      requestId
    );
  }

  if (totalTokens > 4000 || cost.totalCostUsd > 0.1) {
    await dispatchAlert(app, {
      title: "Usage spike detected",
      message: `User ${input.auth.userId} triggered a high-cost request in ${input.request.category}.`,
      severity: "warning"
    });
  }

  const analyticsWrite = await mirrorUsageEventToAnalytics(app, usagePayload);

  return {
    requestId,
    provider,
    providerModel: providerResponse.model,
    model: input.request.model,
    output: providerResponse.output,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: Number(cost.totalCostUsd.toFixed(6)),
    warning: decision.action === "warn" ? decision.warning : undefined,
    enforcement: decision.action === "warn" ? "warn" : "allow",
    analyticsStatus: analyticsWrite.status,
    analyticsDetail: analyticsWrite.detail,
    optimizationHints: generateOptimizationHints({
      model: input.request.model,
      promptTokens,
      completionTokens,
      category: input.request.category
    }),
    source: serializeUsageSource(source),
    integrationType: serializeIntegrationType(integrationType),
    replayed: false
  };
}

async function findExistingRequestOutcome(
  app: FastifyInstance,
  requestId: string,
  provider: ProviderName,
  model: string,
  source: ReturnType<typeof normalizeUsageSource>,
  integrationType: ReturnType<typeof normalizeIntegrationType>
) {
  try {
    const existing = await findUsageEventByRequestId(app, requestId);
    if (!existing) {
      return null;
    }

    const metadata =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const governedResponse =
      metadata.governedResponse && typeof metadata.governedResponse === "object"
        ? (metadata.governedResponse as Record<string, unknown>)
        : {};

    if (existing.status === "success" && typeof governedResponse.output === "string") {
      return {
        requestId,
        provider,
        providerModel:
          typeof governedResponse.providerModel === "string" ? governedResponse.providerModel : model,
        model,
        output: governedResponse.output,
        promptTokens: existing.promptTokens,
        completionTokens: existing.completionTokens,
        totalTokens: existing.totalTokens,
        costUsd: Number(existing.costUsd),
        enforcement: "allow" as const,
        analyticsStatus: "skipped" as const,
        analyticsDetail: "Replay served from previously finalized usage event.",
        optimizationHints: generateOptimizationHints({
          model,
          promptTokens: existing.promptTokens,
          completionTokens: existing.completionTokens,
          category: existing.category
        }),
        source: serializeUsageSource(source),
        integrationType: serializeIntegrationType(integrationType),
        replayed: true
      };
    }

    if (existing.status === "pending") {
      throw new GovernedRequestError(
        "A governed request with this requestId is already pending.",
        409,
        "duplicate_pending",
        requestId
      );
    }

    if (existing.status === "blocked") {
      const policy =
        metadata.policy && typeof metadata.policy === "object"
          ? (metadata.policy as Record<string, unknown>)
          : {};
      const action = typeof policy.action === "string" ? policy.action : "block";
      const reason =
        typeof policy.reason === "string"
          ? policy.reason
          : "This governed request was previously blocked by policy.";

      throw new GovernedRequestError(
        reason,
        action === "throttle" ? 429 : 403,
        action === "throttle" ? "throttled" : "blocked",
        requestId
      );
    }

    if (existing.status === "tracking_failed") {
      throw new GovernedRequestError(
        "This governed request previously completed upstream but failed CostPilot tracking finalization.",
        409,
        "tracking_failed",
        requestId
      );
    }

    if (existing.status === "provider_error") {
      const providerError =
        metadata.providerError && typeof metadata.providerError === "object"
          ? (metadata.providerError as Record<string, unknown>)
          : {};
      const message =
        typeof providerError.message === "string"
          ? providerError.message
          : "The provider previously failed this governed request.";

      throw new GovernedRequestError(message, 502, "provider_error", requestId);
    }

    return null;
  } catch (error) {
    if (error instanceof GovernedRequestError) {
      throw error;
    }

    return null;
  }
}

async function safeUpdateUsageEventStatus(
  app: FastifyInstance,
  eventId: string,
  input: {
    status: string;
    metadata?: Record<string, unknown>;
    completedAt?: Date;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  }
) {
  try {
    await updateUsageEventStatus(app, {
      eventId,
      ...input
    });
  } catch (error) {
    app.log.warn({ error, eventId, nextStatus: input.status }, "Unable to update usage event status");
  }
}

function inferProvider(model: string): ProviderName {
  if (model.startsWith("claude")) {
    return "anthropic";
  }

  if (model.startsWith("gemini")) {
    return "gemini";
  }

  return "openai";
}

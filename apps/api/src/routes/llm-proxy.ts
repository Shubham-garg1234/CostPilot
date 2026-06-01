import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { calculateCost } from "../services/costing.js";
import { evaluatePolicy } from "../services/policy-engine.js";
import { commitUsage } from "../services/usage-counter-service.js";
import {
  estimatePromptTokens,
  notifyIfDailyTokenLimitReached,
  releaseQuotaReservation,
  reserveDailyTokenQuota
} from "../services/quota-service.js";
import { mirrorUsageEventToAnalytics, persistUsageEvent } from "../services/analytics-service.js";
import { dispatchAlert } from "../services/notification-service.js";
import { generateOptimizationHints } from "../services/optimizer-service.js";
import { generateResponse } from "../providers/index.js";
import { ProviderError } from "../providers/shared.js";
import type { LlmProxyRequest } from "../types.js";
import {
  integrationTypeValues,
  normalizeIntegrationType,
  normalizeUsageSource,
  usageSourceValues
} from "../services/usage-source.js";

const requestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  category: z.string().min(1),
  feature: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional(),
  source: z.enum(usageSourceValues).optional(),
  integrationType: z.enum(integrationTypeValues).optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  status: z.string().optional(),
  maxOutputTokens: z.number().int().nonnegative().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export async function registerLlmProxyRoutes(app: FastifyInstance) {
  app.post("/api/llm-proxy", { preHandler: [authenticate] }, async (request, reply) => {
    let reservationId: string | null = null;

    try {
      const body = requestSchema.parse(request.body) as LlmProxyRequest;
      const decision = await evaluatePolicy(app, request.auth, body);

      if (!decision.allowed) {
        return reply.status(403).send({
          status: "blocked",
          reason: "reason" in decision ? decision.reason : "Blocked by policy."
        });
      }

      if (decision.action === "throttle" && decision.throttleMs) {
        return reply.status(429).send({
          status: "throttled",
          reason: decision.warning ?? "Request has been throttled by policy.",
          retryAfterMs: decision.throttleMs
        });
      }

      const provider = body.provider ?? inferProvider(body.model);
      const quotaDecision = await reserveDailyTokenQuota(app, {
        auth: request.auth,
        category: body.category,
        feature: body.feature,
        model: body.model,
        provider,
        prompt: body.prompt,
        estimatedInputTokens: estimatePromptTokens(body.prompt),
        estimatedOutputTokens: body.maxOutputTokens ?? 2_000,
        metadata: body.metadata
      });

      if (!quotaDecision.allowed) {
        return reply.status(403).send(quotaDecision);
      }

      reservationId = quotaDecision.reservationId;
      const providerResponse = await generateResponse({
        provider,
        model: body.model,
        prompt: body.prompt,
        metadata: body.metadata
      });
      const promptTokens = providerResponse.promptTokens;
      const completionTokens = providerResponse.completionTokens;
      const totalTokens = promptTokens + completionTokens;
      const cost = calculateCost(body.model, promptTokens, completionTokens);
      const source = normalizeUsageSource(body.source);
      const integrationType = normalizeIntegrationType(body.integrationType);
      const usagePayload = {
        auth: request.auth,
        provider,
        model: body.model,
        category: body.category,
        feature: body.feature,
        source,
        integrationType,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        status: body.status ?? "success",
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: cost.totalCostUsd,
        metadata: body.metadata,
        startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        completedAt: body.completedAt ? new Date(body.completedAt) : undefined
      };
      const usageEvent = await persistUsageEvent(app, usagePayload);
      const analyticsWrite = usageEvent
        ? await mirrorUsageEventToAnalytics(app, usagePayload)
        : { persisted: false, status: "skipped" as const, detail: "Duplicate usage event." };

      if (usageEvent) {
        await commitUsage(app, request.auth, body.category, body.feature, totalTokens, cost.totalCostUsd);
        await releaseQuotaReservation(app, reservationId);
        await notifyIfDailyTokenLimitReached(app, {
          auth: request.auth,
          category: body.category,
          feature: body.feature,
          model: body.model,
          provider,
          estimatedTotalTokens: totalTokens,
          estimatedCostUsd: cost.totalCostUsd,
          metadata: body.metadata
        });
      } else {
        await releaseQuotaReservation(app, reservationId);
      }

      if (usageEvent && (totalTokens > 4000 || cost.totalCostUsd > 0.1)) {
        await dispatchAlert(app, {
          title: "Usage spike detected",
          message: `User ${request.auth.userId} triggered a high-cost request in ${body.category}.`,
          severity: "warning"
        });
      }

      return reply.send({
        status: "ok",
        enforcement: decision.action,
        warning: decision.allowed && decision.action !== "allow" ? decision.warning : undefined,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          costUsd: Number(cost.totalCostUsd.toFixed(6)),
          recorded: Boolean(usageEvent),
          source: body.source ?? "sdk",
          integrationType: body.integrationType ?? "proxy"
        },
        analyticsStatus: analyticsWrite.status,
        analyticsDetail: analyticsWrite.detail,
        optimizationHints: generateOptimizationHints({
          model: body.model,
          promptTokens,
          completionTokens,
          category: body.category
        }),
        response: {
          provider,
          model: providerResponse.model,
          output: providerResponse.output
        }
      });
    } catch (error) {
      await releaseQuotaReservation(app, reservationId).catch(() => undefined);

      if (error instanceof ProviderError) {
        request.log.warn({ error }, "Upstream provider request failed");
        return reply.status(error.statusCode).send({
          status: "provider_error",
          provider: error.provider,
          retryable: error.retryable,
          message: error.message
        });
      }

      throw error;
    }
  });
}

function inferProvider(model: string): "openai" | "anthropic" | "gemini" {
  if (model.startsWith("claude")) {
    return "anthropic";
  }

  if (model.startsWith("gemini")) {
    return "gemini";
  }

  return "openai";
}

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { ProviderError } from "../providers/shared.js";
import { recordActivity } from "../services/activity-log-service.js";
import { mirrorUsageEventToAnalytics, persistUsageEvent } from "../services/analytics-service.js";
import { commitUsage } from "../services/usage-counter-service.js";
import { enhancePrompt } from "../services/prompt-enhancement-service.js";
import {
  estimatePromptTokens,
  notifyIfDailyTokenLimitReached,
  releaseQuotaReservation,
  reserveDailyTokenQuota
} from "../services/quota-service.js";
import {
  integrationTypeValues,
  normalizeIntegrationType,
  normalizeUsageSource,
  usageSourceValues
} from "../services/usage-source.js";

const promptEnhancementSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  targetModel: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  source: z.enum(usageSourceValues).optional(),
  integrationType: z.enum(integrationTypeValues).optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional()
});

export async function registerPromptEnhancementRoutes(app: FastifyInstance) {
  app.post("/api/prompt-enhancement", { preHandler: [authenticate] }, async (request, reply) => {
    let reservationId: string | null = null;
    let activityContext:
      | {
          source: string;
          integrationType: string;
          workspaceId?: string;
          sessionId?: string;
          requestId?: string;
          metadata?: Record<string, unknown>;
        }
      | null = null;

    try {
      const body = promptEnhancementSchema.parse(request.body);
      activityContext = {
        source: body.source ?? "mcp",
        integrationType: body.integrationType ?? "mcp",
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        metadata: body.metadata
      };

      await recordActivity(app, {
        auth: request.auth,
        eventType: "prompt_enhancement.requested",
        eventCategory: "prompt_enhancement",
        status: "started",
        source: activityContext.source,
        integrationType: activityContext.integrationType,
        workspaceId: activityContext.workspaceId,
        sessionId: activityContext.sessionId,
        requestId: activityContext.requestId,
        metadata: {
          promptLength: body.prompt.length,
          targetModel: body.targetModel,
          model: body.model,
          ...activityContext.metadata
        }
      });

      const quotaDecision = await reserveDailyTokenQuota(app, {
        auth: request.auth,
        category: "prompt_enhancement",
        feature: "prompt_tuning",
        model: body.model ?? "gpt-4o-mini",
        provider: "openai",
        prompt: body.prompt,
        estimatedInputTokens: estimatePromptTokens(body.prompt),
        estimatedOutputTokens: 1_200,
        metadata: body.metadata
      });

      if (!quotaDecision.allowed) {
        await recordActivity(app, {
          auth: request.auth,
          eventType: "quota.preflight_blocked",
          eventCategory: "quota",
          status: "blocked",
          outcomeReason: quotaDecision.reason,
          source: activityContext.source,
          integrationType: activityContext.integrationType,
          workspaceId: activityContext.workspaceId,
          sessionId: activityContext.sessionId,
          requestId: activityContext.requestId,
          metadata: quotaDecision
        });
        return reply.status(403).send(quotaDecision);
      }

      reservationId = quotaDecision.reservationId;
      await recordActivity(app, {
        auth: request.auth,
        eventType: "quota.preflight_allowed",
        eventCategory: "quota",
        status: "success",
        source: activityContext.source,
        integrationType: activityContext.integrationType,
        workspaceId: activityContext.workspaceId,
        sessionId: activityContext.sessionId,
        requestId: activityContext.requestId,
        subjectType: "quota_reservation",
        subjectId: reservationId,
        metadata: quotaDecision
      });

      const result = await enhancePrompt(body);
      const source = normalizeUsageSource(body.source ?? "mcp");
      const integrationType = normalizeIntegrationType(body.integrationType ?? "mcp");
      const usagePayload = {
        auth: request.auth,
        provider: result.provider,
        model: result.model,
        category: "prompt_enhancement",
        feature: "prompt_tuning",
        source,
        integrationType,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        status: "success",
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        costUsd: result.costUsd,
        metadata: body.metadata
      };
      const usageEvent = await persistUsageEvent(app, usagePayload);
      const analyticsWrite = usageEvent
        ? await mirrorUsageEventToAnalytics(app, usagePayload)
        : { status: "skipped" as const, detail: "Duplicate or unavailable usage persistence." };

      if (usageEvent) {
        await commitUsage(app, request.auth, usagePayload.category, usagePayload.feature, result.totalTokens, result.costUsd);
        await releaseQuotaReservation(app, reservationId);
        await notifyIfDailyTokenLimitReached(app, {
          auth: request.auth,
          category: usagePayload.category,
          feature: usagePayload.feature,
          model: result.model,
          provider: result.provider,
          estimatedTotalTokens: result.totalTokens,
          estimatedCostUsd: result.costUsd,
          metadata: body.metadata
        });
      } else {
        await releaseQuotaReservation(app, reservationId);
      }

      await recordActivity(app, {
        auth: request.auth,
        eventType: "prompt_enhancement.completed",
        eventCategory: "prompt_enhancement",
        status: "success",
        source,
        integrationType,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        requestId: body.requestId,
        subjectType: "usage_event",
        subjectId: usageEvent?.id,
        metadata: {
          provider: result.provider,
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          costUsd: result.costUsd,
          recorded: Boolean(usageEvent),
          analyticsStatus: analyticsWrite.status,
          analyticsDetail: analyticsWrite.detail
        }
      });

      return reply.send({
        status: "ok",
        ...result,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          costUsd: result.costUsd
        },
        recorded: Boolean(usageEvent),
        analyticsStatus: analyticsWrite.status,
        analyticsDetail: analyticsWrite.detail
      });
    } catch (error) {
      await releaseQuotaReservation(app, reservationId).catch(() => undefined);
      if (activityContext) {
        await recordActivity(app, {
          auth: request.auth,
          eventType: "prompt_enhancement.failed",
          eventCategory: "prompt_enhancement",
          status: "failed",
          outcomeReason: error instanceof Error ? error.message : "Prompt enhancement failed.",
          source: activityContext.source,
          integrationType: activityContext.integrationType,
          workspaceId: activityContext.workspaceId,
          sessionId: activityContext.sessionId,
          requestId: activityContext.requestId,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            provider: error instanceof ProviderError ? error.provider : undefined,
            retryable: error instanceof ProviderError ? error.retryable : undefined
          }
        });
      }

      if (error instanceof ProviderError) {
        request.log.warn({ error }, "Prompt enhancement provider request failed");
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

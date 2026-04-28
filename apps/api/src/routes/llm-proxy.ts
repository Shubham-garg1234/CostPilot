import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import {
  ExecuteLlmRequestResult,
  GovernedRequestError,
  executeTrackedLlmRequest
} from "../services/llm-execution-service.js";
import type { LlmProxyRequest } from "../types.js";
import {
  integrationTypeValues,
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
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export async function registerLlmProxyRoutes(app: FastifyInstance) {
  app.post("/api/llm-proxy", { preHandler: [authenticate] }, async (request, reply) => {
    const body = requestSchema.parse(request.body) as LlmProxyRequest;

    try {
      const result = await executeTrackedLlmRequest(app, {
        auth: request.auth,
        request: body
      });

      return reply.send(toProxySuccessPayload(result));
    } catch (error) {
      if (error instanceof GovernedRequestError) {
        if (error.status === "blocked") {
          return reply.status(error.replyStatus).send({
            status: "blocked",
            reason: error.message,
            requestId: error.requestId
          });
        }

        if (error.status === "throttled") {
          return reply.status(error.replyStatus).send({
            status: "throttled",
            reason: error.message,
            retryAfterMs: error.retryAfterMs,
            requestId: error.requestId
          });
        }

        if (error.status === "provider_error") {
          return reply.status(error.replyStatus).send({
            status: "provider_error",
            message: error.message,
            requestId: error.requestId
          });
        }

        return reply.status(error.replyStatus).send({
          status: error.status,
          message: error.message,
          requestId: error.requestId
        });
      }

      throw error;
    }
  });
}

function toProxySuccessPayload(result: ExecuteLlmRequestResult) {
  return {
    status: "ok",
    requestId: result.requestId,
    replayed: result.replayed,
    enforcement: result.enforcement,
    warning: result.warning,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      costUsd: result.costUsd,
      recorded: true,
      source: result.source,
      integrationType: result.integrationType
    },
    analyticsStatus: result.analyticsStatus,
    analyticsDetail: result.analyticsDetail,
    optimizationHints: result.optimizationHints,
    response: {
      provider: result.provider,
      model: result.providerModel,
      output: result.output
    }
  };
}

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { calculateCost } from "../services/costing.js";
import { evaluatePolicy } from "../services/policy-engine.js";
import { commitUsage } from "../services/usage-counter-service.js";
import { enqueueApiLog, persistUsageEvent } from "../services/analytics-service.js";
import { dispatchAlert } from "../services/notification-service.js";
import { generateOptimizationHints } from "../services/optimizer-service.js";
import { generateResponse } from "../providers/index.js";
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
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export async function registerLlmProxyRoutes(app: FastifyInstance) {
  app.post("/api/llm-proxy", { preHandler: [authenticate] }, async (request, reply) => {
    const body = requestSchema.parse(request.body);
    const decision = await evaluatePolicy(app, request.auth, body);

    if (!decision.allowed) {
      return reply.status(403).send({
        status: "blocked",
        reason: decision.reason
      });
    }

    if (decision.action === "throttle" && decision.throttleMs) {
      await new Promise((resolve) => setTimeout(resolve, decision.throttleMs));
    }

    const provider = body.provider ?? inferProvider(body.model);
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

    const usageEvent = await persistUsageEvent(app, {
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
    });

    if (usageEvent) {
      await commitUsage(app, request.auth, body.category, body.feature, totalTokens, cost.totalCostUsd);
      await enqueueApiLog(app, {
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
      });
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

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { calculateCost } from "../services/costing.js";
import { evaluatePolicy } from "../services/policy-engine.js";
import { commitUsage } from "../services/usage-counter-service.js";
import { enqueueApiLog, persistAggregate } from "../services/analytics-service.js";
import { dispatchAlert } from "../services/notification-service.js";
import { generateOptimizationHints } from "../services/optimizer-service.js";
import { generateResponse } from "../providers/index.js";

const requestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  category: z.string().min(1),
  feature: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  provider: z.enum(["openai", "anthropic", "gemini"]).optional()
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

    await commitUsage(app, request.auth, body.category, body.feature, totalTokens, cost.totalCostUsd);
    await persistAggregate(app, {
      auth: request.auth,
      model: body.model,
      category: body.category,
      feature: body.feature,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: cost.totalCostUsd,
      metadata: body.metadata,
      warning: decision.allowed && decision.action !== "allow" ? decision.warning : undefined
    });
    await enqueueApiLog(app, {
      auth: request.auth,
      model: body.model,
      category: body.category,
      feature: body.feature,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: cost.totalCostUsd,
      metadata: body.metadata,
      warning: decision.allowed && decision.action !== "allow" ? decision.warning : undefined
    });

    if (totalTokens > 4000 || cost.totalCostUsd > 0.1) {
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
        costUsd: Number(cost.totalCostUsd.toFixed(6))
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

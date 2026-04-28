import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { authenticateManagedCursorGateway } from "../auth.js";
import {
  CURSOR_GATEWAY_API_VERSION,
  CURSOR_MANAGED_DEPLOYMENTS,
  resolveCursorDeployment
} from "../services/cursor-managed-config.js";
import {
  GovernedRequestError,
  executeTrackedLlmRequest
} from "../services/llm-execution-service.js";

const messagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional()
});

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(messagePartSchema)])
});

const chatCompletionsSchema = z.object({
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  user: z.string().optional(),
  costpilot: z.object({
    category: z.string().optional(),
    feature: z.string().optional(),
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
    requestId: z.string().optional()
  }).optional()
});

export async function registerCursorGatewayRoutes(app: FastifyInstance) {
  app.get("/api/gateway/cursor/openai/deployments", { preHandler: [authenticateManagedCursorGateway] }, async () => {
    return {
      object: "list",
      apiVersion: CURSOR_GATEWAY_API_VERSION,
      data: CURSOR_MANAGED_DEPLOYMENTS.map((entry) => ({
        id: entry.deployment,
        object: "deployment",
        provider: entry.provider,
        model: entry.model
      }))
    };
  });

  app.post(
    "/api/gateway/cursor/openai/deployments/:deployment/chat/completions",
    { preHandler: [authenticateManagedCursorGateway] },
    async (request, reply) => {
      const params = request.params as Record<string, string>;
      const deployment = resolveCursorDeployment(String(params?.deployment ?? ""));
      if (!deployment) {
        return reply.status(404).send({
          error: {
            code: "deployment_not_found",
            message: "The requested managed deployment does not exist."
          }
        });
      }

      const apiVersion = typeof request.query === "object" && request.query
        ? (request.query as Record<string, unknown>)["api-version"]
        : undefined;
      if (typeof apiVersion === "string" && apiVersion !== CURSOR_GATEWAY_API_VERSION) {
        return reply.status(400).send({
          error: {
            code: "unsupported_api_version",
            message: `Use api-version=${CURSOR_GATEWAY_API_VERSION} for the managed Cursor gateway.`
          }
        });
      }

      const body = chatCompletionsSchema.parse(request.body);
      const normalizedMessages = body.messages.map((message) => ({
        role: message.role,
        content: normalizeMessageContent(message.content)
      }));
      const prompt = normalizedMessages
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n\n")
        .trim();

      try {
        const result = await executeTrackedLlmRequest(app, {
          auth: request.auth,
          request: {
            prompt,
            model: deployment.model,
            provider: deployment.provider,
            category: body.costpilot?.category ?? "code_generation",
            feature: body.costpilot?.feature ?? "cursor_managed",
            metadata: {
              ...(body.metadata ?? {}),
              cursor: {
                user: body.user,
                deployment: deployment.deployment
              }
            },
            source: "cursor",
            integrationType: "proxy",
            workspaceId: body.costpilot?.workspaceId,
            sessionId: body.costpilot?.sessionId,
            requestId:
              body.costpilot?.requestId ||
              getHeaderValue(request.headers["x-request-id"])
          },
          messages: normalizedMessages,
          temperature: body.temperature,
          maxTokens: body.max_tokens
        });

        setGovernanceHeaders(reply, result);

        if (body.stream) {
          return sendStreamingChatCompletion(reply, deployment.model, result);
        }

        return reply.send({
          id: result.requestId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: deployment.model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: result.output
              }
            }
          ],
          usage: {
            prompt_tokens: result.promptTokens,
            completion_tokens: result.completionTokens,
            total_tokens: result.totalTokens
          }
        });
      } catch (error) {
        if (error instanceof GovernedRequestError) {
          return reply.status(error.replyStatus).send({
            error: {
              code: mapGatewayErrorCode(error.status),
              message: error.message,
              request_id: error.requestId,
              retry_after_ms: error.retryAfterMs
            }
          });
        }

        throw error;
      }
    }
  );
}

function sendStreamingChatCompletion(
  reply: FastifyReply,
  model: string,
  result: Awaited<ReturnType<typeof executeTrackedLlmRequest>>
) {
  reply.hijack();
  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");

  writeSse(reply, {
    id: result.requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant"
        },
        finish_reason: null
      }
    ]
  });

  if (result.output) {
    writeSse(reply, {
      id: result.requestId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            content: result.output
          },
          finish_reason: null
        }
      ]
    });
  }

  writeSse(reply, {
    id: result.requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.totalTokens
    }
  });

  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
  return reply;
}

function setGovernanceHeaders(
  reply: FastifyReply,
  result: Awaited<ReturnType<typeof executeTrackedLlmRequest>>
) {
  reply.header("x-request-id", result.requestId);
  reply.header("x-costpilot-enforcement", result.enforcement);
  reply.header("x-costpilot-replayed", String(result.replayed));
  if (result.warning) {
    reply.header("x-costpilot-warning", result.warning);
  }
}

function writeSse(reply: FastifyReply, payload: Record<string, unknown>) {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeMessageContent(content: string | Array<{ type: string; text?: string }>) {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value;
}

function mapGatewayErrorCode(status: GovernedRequestError["status"]) {
  switch (status) {
    case "throttled":
      return "policy_throttled";
    case "blocked":
      return "policy_blocked";
    case "provider_error":
      return "provider_error";
    case "duplicate_pending":
      return "request_pending";
    case "tracking_failed":
    default:
      return "tracking_failed";
  }
}

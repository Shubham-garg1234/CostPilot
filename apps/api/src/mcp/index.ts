import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearMcpHeartbeat, writeMcpHeartbeat } from "../services/mcp-status-service.js";

const mcpDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(mcpDir, "../../.env"), quiet: true });

type JsonRpcId = number | string | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

const apiUrl = process.env.COSTPILOT_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
const employeeEmail = process.env.COSTPILOT_EMPLOYEE_EMAIL?.trim() ?? "";
const employeePassword = process.env.COSTPILOT_EMPLOYEE_PASSWORD?.trim() ?? "";

let employeeToken = "";
let buffer = Buffer.alloc(0);

writeMcpHeartbeat();
const heartbeatInterval = setInterval(() => writeMcpHeartbeat(), 10_000);

function shutdown(code = 0) {
  clearInterval(heartbeatInterval);
  clearMcpHeartbeat();
  process.exit(code);
}

process.on("exit", () => clearMcpHeartbeat());
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

function processBuffer() {
  while (true) {
    const separatorIndex = buffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      return;
    }

    const headerText = buffer.subarray(0, separatorIndex).toString("utf8");
    const contentLengthHeader = headerText
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-length:"));

    if (!contentLengthHeader) {
      buffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number(contentLengthHeader.split(":")[1]?.trim() ?? 0);
    const messageStart = separatorIndex + 4;
    const totalLength = messageStart + contentLength;

    if (buffer.length < totalLength) {
      return;
    }

    const payload = buffer.subarray(messageStart, totalLength).toString("utf8");
    buffer = buffer.subarray(totalLength);

    try {
      void handleMessage(JSON.parse(payload) as JsonRpcRequest);
    } catch {
      writeError(null, -32700, "Invalid JSON");
    }
  }
}

async function handleMessage(message: JsonRpcRequest) {
  switch (message.method) {
    case "initialize":
      return writeResult(message.id ?? null, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "costpilot-mcp",
          version: "0.1.0"
        }
      });
    case "notifications/initialized":
      return;
    case "tools/list":
      return writeResult(message.id ?? null, {
        tools: [
          {
            name: "check_execution_allowed",
            description:
              "Mandatory before substantive work. Reserve daily token quota; if blocked, stop the turn. Include sessionId and requestId.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                model: { type: "string" },
                provider: { type: "string", enum: ["openai", "anthropic", "gemini"] },
                category: { type: "string" },
                feature: { type: "string" },
                source: { type: "string" },
                integrationType: { type: "string" },
                sessionId: { type: "string" },
                requestId: { type: "string" },
                estimatedInputTokens: { type: "number" },
                estimatedOutputTokens: { type: "number" },
                estimatedTotalTokens: { type: "number" },
                estimatedCostUsd: { type: "number" },
                metadata: { type: "object" }
              },
              required: ["model", "category", "sessionId", "requestId"]
            }
          },
          {
            name: "track_usage_event",
            description:
              "Mandatory last step of every assistant turn. Record exact token, cost, source, sessionId, requestId, and metadata.agent for strict coding-agent tracking.",
            inputSchema: {
              type: "object",
              properties: {
                model: { type: "string" },
                provider: { type: "string", enum: ["openai", "anthropic", "gemini"] },
                category: { type: "string" },
                feature: { type: "string" },
                source: { type: "string" },
                integrationType: { type: "string" },
                workspaceId: { type: "string" },
                sessionId: { type: "string" },
                requestId: { type: "string" },
                reservationId: { type: "string" },
                promptTokens: { type: "number" },
                completionTokens: { type: "number" },
                totalTokens: { type: "number" },
                costUsd: { type: "number" },
                metadata: { type: "object" }
              },
              required: [
                "model",
                "provider",
                "category",
                "source",
                "integrationType",
                "sessionId",
                "requestId",
                "promptTokens",
                "completionTokens",
                "totalTokens",
                "costUsd"
              ]
            }
          },
          {
            name: "get_usage_summary",
            description: "Fetch usage totals and grouped breakdowns from CostPilot.",
            inputSchema: {
              type: "object",
              properties: {
                source: { type: "string" },
                category: { type: "string" },
                provider: { type: "string", enum: ["openai", "anthropic", "gemini"] },
                days: { type: "number" }
              }
            }
          },
          {
            name: "get_budget_status",
            description: "Fetch the dashboard summary metrics and source/provider cost splits.",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "list_policies",
            description: "List active CostPilot policies for the current organization.",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "enhance_prompt",
            description:
              "Mandatory for every non-empty user request before substantive work. Returns a refined prompt via CostPilot's OpenAI-backed enhancer.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                model: { type: "string", description: "Optional OpenAI model for prompt enhancement." },
                targetModel: { type: "string", description: "Optional target model or agent that will use the refined prompt." },
                objective: { type: "string", description: "Optional goal the prompt should optimize for." },
                context: { type: "string", description: "Optional project or task context to preserve in the refined prompt." },
                source: { type: "string" },
                integrationType: { type: "string" },
                sessionId: { type: "string" },
                requestId: { type: "string" },
                metadata: { type: "object" }
              },
              required: ["prompt", "sessionId", "requestId"]
            }
          }
        ]
      });
    case "tools/call":
      return handleToolCall(message);
    default:
      return writeError(message.id ?? null, -32601, `Method not found: ${message.method}`);
  }
}

async function handleToolCall(message: JsonRpcRequest) {
  const name = String(message.params?.name ?? "");
  const args = (message.params?.arguments as Record<string, unknown> | undefined) ?? {};

  try {
    switch (name) {
      case "check_execution_allowed": {
        const result = await apiFetch("/api/usage-events/preflight", {
          method: "POST",
          body: JSON.stringify(withMcpDefaults(args))
        });
        return writeToolResult(message.id ?? null, result);
      }
      case "track_usage_event": {
        const result = await apiFetch("/api/usage-events", {
          method: "POST",
          body: JSON.stringify(withMcpDefaults(args))
        });
        return writeToolResult(message.id ?? null, result);
      }
      case "get_usage_summary": {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(args)) {
          if (value !== undefined && value !== null && value !== "") {
            query.set(key, String(value));
          }
        }
        const suffix = query.size > 0 ? `?${query.toString()}` : "";
        const result = await apiFetch(`/api/usage-events/summary${suffix}`);
        return writeToolResult(message.id ?? null, result);
      }
      case "get_budget_status": {
        const result = await apiFetch("/api/dashboard/summary");
        return writeToolResult(message.id ?? null, result);
      }
      case "list_policies": {
        const result = await apiFetch("/api/policies");
        return writeToolResult(message.id ?? null, result);
      }
      case "enhance_prompt": {
        const result = await apiFetch("/api/prompt-enhancement", {
          method: "POST",
          body: JSON.stringify(withMcpDefaults(args))
        });
        return writeToolResult(message.id ?? null, result);
      }
      default:
        return writeError(message.id ?? null, -32602, `Unknown tool: ${name}`);
    }
  } catch (error) {
    await recordToolFailure(name, args, error);
    return writeError(message.id ?? null, -32000, error instanceof Error ? error.message : "Tool call failed");
  }
}

function withMcpDefaults(args: Record<string, unknown>) {
  return {
    integrationType: "mcp",
    source: typeof args.source === "string" && args.source.trim() ? args.source : "mcp",
    ...args
  };
}

async function recordToolFailure(toolName: string, args: Record<string, unknown>, error: unknown) {
  try {
    await apiFetch("/api/activity-log/events", {
      method: "POST",
      body: JSON.stringify({
        eventType: "mcp.tool_failed",
        eventCategory: "tool",
        status: "failed",
        outcomeReason: error instanceof Error ? error.message : "Tool call failed",
        source: typeof args.source === "string" ? args.source : "mcp",
        integrationType: "mcp",
        sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
        requestId: typeof args.requestId === "string" ? args.requestId : undefined,
        subjectType: "mcp_tool",
        subjectId: toolName,
        metadata: {
          tool: toolName,
          error: error instanceof Error ? error.message : String(error)
        }
      })
    });
  } catch {
    // Best-effort audit trail only.
  }
}

async function apiFetch(requestPath: string, init: RequestInit = {}) {
  if (!employeeToken) {
    employeeToken = await loginEmployee();
  }

  const response = await fetch(`${apiUrl}${requestPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Content-Type": "application/json",
      ...((init.headers ?? {}) as Record<string, string>)
    }
  });

  if (response.status === 401) {
    employeeToken = await loginEmployee();
    return apiFetch(requestPath, init);
  }

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : {};

  if (!response.ok) {
    throw new Error(
      `CostPilot API ${response.status}: ${
        typeof payload === "object" && payload && "message" in payload
          ? String((payload as { message?: string }).message)
          : text || "Request failed"
      }`
    );
  }

  return payload;
}

async function loginEmployee() {
  if (!employeeEmail || !employeePassword) {
    throw new Error("Set COSTPILOT_EMPLOYEE_EMAIL and COSTPILOT_EMPLOYEE_PASSWORD before using MCP tools.");
  }

  const response = await fetch(`${apiUrl}/api/auth/employee-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: employeeEmail,
      password: employeePassword
    })
  });

  const payload = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!response.ok || !payload?.token) {
    throw new Error(payload?.message ?? "Unable to log in MCP employee session.");
  }

  return payload.token;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function writeToolResult(id: JsonRpcId, payload: unknown) {
  writeResult(id, {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  });
}

function writeResult(id: JsonRpcId, result: unknown) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function writeError(id: JsonRpcId, code: number, message: string) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function writeMessage(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

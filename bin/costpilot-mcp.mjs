#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_INFO = {
  name: "costpilot-mcp",
  version: "0.1.0"
};

const apiUrl =
  process.env.COSTPILOT_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:4000";
const employeeEmail = process.env.COSTPILOT_EMPLOYEE_EMAIL?.trim() || "";
const employeePassword = process.env.COSTPILOT_EMPLOYEE_PASSWORD?.trim() || "";

let employeeToken = "";

const tools = [
  {
    name: "check_execution_allowed",
    description: "Mandatory before substantive work. Reserve quota; include sessionId and requestId.",
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
    description: "Mandatory last step of every assistant turn with exact usage metadata.",
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
        status: { type: "string" },
        promptTokens: { type: "number" },
        completionTokens: { type: "number" },
        totalTokens: { type: "number" },
        costUsd: { type: "number" },
        metadata: { type: "object" },
        startedAt: { type: "string" },
        completedAt: { type: "string" }
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
    description: "Mandatory for every non-empty user request before substantive work.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        targetModel: { type: "string" },
        objective: { type: "string" },
        context: { type: "string" },
        source: { type: "string" },
        integrationType: { type: "string" },
        sessionId: { type: "string" },
        requestId: { type: "string" },
        metadata: { type: "object" }
      },
      required: ["prompt", "sessionId", "requestId"]
    }
  }
];

function withMcpDefaults(args) {
  return {
    integrationType: "mcp",
    source: typeof args.source === "string" && args.source.trim() ? args.source : "mcp",
    ...args
  };
}

async function recordToolFailure(toolName, args, error) {
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
        metadata: { tool: toolName, error: error instanceof Error ? error.message : String(error) }
      })
    });
  } catch {
    // Best-effort audit trail only.
  }
}

const server = new Server(
  SERVER_INFO,
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = String(request.params.name ?? "");
  const args = request.params.arguments ?? {};

  try {
    switch (name) {
      case "check_execution_allowed":
        return createToolResult(
          await apiFetch("/api/usage-events/preflight", {
            method: "POST",
            body: JSON.stringify(withMcpDefaults(args))
          })
        );
      case "track_usage_event":
        return createToolResult(
          await apiFetch("/api/usage-events", {
            method: "POST",
            body: JSON.stringify(withMcpDefaults(args))
          })
        );
      case "get_usage_summary": {
        const query = new URLSearchParams();

        for (const [key, value] of Object.entries(args)) {
          if (value !== undefined && value !== null && value !== "") {
            query.set(key, String(value));
          }
        }

        const suffix = query.size > 0 ? `?${query.toString()}` : "";
        return createToolResult(await apiFetch(`/api/usage-events/summary${suffix}`));
      }
      case "get_budget_status":
        return createToolResult(await apiFetch("/api/dashboard/summary"));
      case "list_policies":
        return createToolResult(await apiFetch("/api/policies"));
      case "enhance_prompt":
        return createToolResult(
          await apiFetch("/api/prompt-enhancement", {
            method: "POST",
            body: JSON.stringify(withMcpDefaults(args))
          })
        );
      default:
        return createToolError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    await recordToolFailure(name, args, error);
    const message = error instanceof Error ? error.message : "Tool call failed";
    return createToolError(message);
  }
});

async function apiFetch(requestPath, init = {}) {
  if (!employeeToken) {
    employeeToken = await loginEmployee();
  }

  const response = await fetch(`${apiUrl}${requestPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${employeeToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
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
          ? String(payload.message)
          : text || "Request failed"
      }`
    );
  }

  return payload;
}

async function loginEmployee() {
  if (!employeeEmail || !employeePassword) {
    throw new Error("Set COSTPILOT_EMPLOYEE_EMAIL and COSTPILOT_EMPLOYEE_PASSWORD before using CostPilot MCP.");
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

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.token) {
    throw new Error(payload?.message ?? "Unable to log in MCP employee session.");
  }

  return payload.token;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createToolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function createToolError(message) {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(
    "[costpilot-mcp] Fatal startup error:",
    error instanceof Error ? error.stack ?? error.message : error
  );
  process.exit(1);
});

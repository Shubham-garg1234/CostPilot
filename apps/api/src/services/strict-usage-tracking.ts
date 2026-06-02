import type { ApiIntegrationType, ApiUsageSource } from "./usage-source.js";

export const CODING_AGENT_SOURCES = ["cursor", "claude", "codex", "copilot", "mcp"] as const;

export type StrictUsageInput = {
  rawBody: Record<string, unknown>;
  provider: string;
  model: string;
  source: ApiUsageSource;
  integrationType: ApiIntegrationType;
  sessionId?: string;
  requestId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
};

export type StrictUsageValidationResult =
  | { ok: true; agentMetadata: Record<string, unknown> }
  | { ok: false; reason: string; missing: string[] };

function fieldPresent(raw: Record<string, unknown>, key: string) {
  return raw[key] !== undefined && raw[key] !== null;
}

export function isCodingAgentTrackingContext(source: ApiUsageSource, integrationType: ApiIntegrationType) {
  return integrationType === "mcp" || (CODING_AGENT_SOURCES as readonly string[]).includes(source);
}

export function validateStrictCodingAgentUsage(input: StrictUsageInput): StrictUsageValidationResult {
  const missing: string[] = [];
  const requiredFields = [
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "costUsd",
    "provider",
    "model",
    "source",
    "integrationType",
    "sessionId",
    "requestId"
  ] as const;

  for (const field of requiredFields) {
    if (field === "provider" || field === "model" || field === "source" || field === "integrationType") {
      continue;
    }
    if (!fieldPresent(input.rawBody, field)) {
      missing.push(field);
    }
  }

  if (!input.sessionId?.trim()) {
    missing.push("sessionId");
  }
  if (!input.requestId?.trim()) {
    missing.push("requestId");
  }

  const expectedTotal = input.promptTokens + input.completionTokens;
  if (input.totalTokens !== expectedTotal) {
    missing.push("totalTokens (must equal promptTokens + completionTokens)");
  }

  const agent = (input.metadata?.agent ?? {}) as Record<string, unknown>;
  if (agent.exact === false) {
    return {
      ok: false,
      reason: "Coding-agent usage must report exact token and cost metadata (metadata.agent.exact cannot be false).",
      missing: ["metadata.agent.exact"]
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason: "Strict coding-agent tracking requires exact usage metadata for every agent turn.",
      missing
    };
  }

  return {
    ok: true,
    agentMetadata: buildAgentMetadata(input)
  };
}

export function buildAgentMetadata(input: StrictUsageInput) {
  const agent = (input.metadata?.agent ?? {}) as Record<string, unknown>;
  return {
    ...input.metadata,
    agent: {
      name: typeof agent.name === "string" && agent.name.trim() ? agent.name : input.source,
      version: typeof agent.version === "string" ? agent.version : undefined,
      sessionId: input.sessionId,
      turnId: input.requestId,
      rawProviderUsage: agent.rawProviderUsage ?? agent.providerUsage ?? input.metadata?.providerUsage,
      exact: true
    }
  };
}

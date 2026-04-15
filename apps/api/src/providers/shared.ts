import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";

export function estimateProviderUsage(request: LlmProviderRequest, outputMultiplier: number): LlmProviderResponse {
  const promptTokens = Math.max(1, Math.ceil(request.prompt.length / 4));
  const completionTokens = Math.max(80, Math.round(promptTokens * outputMultiplier));

  return {
    provider: request.provider,
    model: request.model,
    output: buildProviderOutput(request),
    promptTokens,
    completionTokens
  };
}

function buildProviderOutput(request: LlmProviderRequest) {
  const providerName = request.provider[0].toUpperCase() + request.provider.slice(1);
  return `${providerName} generated a governed response for "${request.prompt.slice(0, 80)}".`;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProviderRequest["provider"],
    readonly statusCode = 502,
    readonly retryable = true
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function shouldUseMockProvider() {
  return (process.env.NODE_ENV ?? "development") !== "production";
}

export function requireProviderKey(provider: LlmProviderRequest["provider"], key?: string) {
  if (key) {
    return key;
  }

  throw new ProviderError(`Missing API key for ${provider}.`, provider, 503, false);
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseProviderError(response: Response, provider: LlmProviderRequest["provider"]) {
  const payload = await response.text().catch(() => "");
  throw new ProviderError(
    `${provider} request failed with status ${response.status}${payload ? `: ${payload.slice(0, 200)}` : ""}`,
    provider,
    response.status,
    response.status >= 500
  );
}

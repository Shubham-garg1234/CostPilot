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


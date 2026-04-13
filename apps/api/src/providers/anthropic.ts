import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage } from "./shared.js";

export async function generateAnthropicResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  return estimateProviderUsage({ ...request, provider: "anthropic" }, 0.6);
}


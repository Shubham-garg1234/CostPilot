import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage } from "./shared.js";

export async function generateOpenAIResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  return estimateProviderUsage({ ...request, provider: "openai" }, 0.55);
}


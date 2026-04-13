import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage } from "./shared.js";

export async function generateGeminiResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  return estimateProviderUsage({ ...request, provider: "gemini" }, 0.5);
}


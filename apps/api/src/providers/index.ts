import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { generateAnthropicResponse } from "./anthropic.js";
import { generateGeminiResponse } from "./gemini.js";
import { generateOpenAIResponse } from "./openai.js";

export async function generateResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  switch (request.provider) {
    case "anthropic":
      return generateAnthropicResponse(request);
    case "gemini":
      return generateGeminiResponse(request);
    case "openai":
    default:
      return generateOpenAIResponse(request);
  }
}

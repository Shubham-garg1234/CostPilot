import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage, fetchWithTimeout, parseProviderError, requireProviderKey, shouldUseMockProvider } from "./shared.js";

export async function generateAnthropicResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey && shouldUseMockProvider()) {
    return estimateProviderUsage({ ...request, provider: "anthropic" }, 0.6);
  }

  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireProviderKey("anthropic", apiKey),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: request.prompt }]
    })
  });

  if (!response.ok) {
    await parseProviderError(response, "anthropic");
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const output = payload.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim() ?? "";

  return {
    provider: "anthropic",
    model: request.model,
    output,
    promptTokens: payload.usage?.input_tokens ?? Math.max(1, Math.ceil(request.prompt.length / 4)),
    completionTokens: payload.usage?.output_tokens ?? Math.max(1, Math.ceil(output.length / 4))
  };
}

import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage, fetchWithTimeout, parseProviderError, requireProviderKey, shouldUseMockProvider } from "./shared.js";

export async function generateAnthropicResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const systemPrompt = request.messages?.filter((entry) => entry.role === "system").map((entry) => entry.content).join("\n\n").trim();
  const messages =
    request.messages
      ?.filter((entry) => entry.role !== "system")
      .map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content
      })) ?? [{ role: "user", content: request.prompt }];

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
      system: systemPrompt || undefined,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      messages
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

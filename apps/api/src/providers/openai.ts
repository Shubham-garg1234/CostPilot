import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage, fetchWithTimeout, parseProviderError, requireProviderKey, shouldUseMockProvider } from "./shared.js";

export async function generateOpenAIResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_PROVIDER_API_KEY;

  if (!apiKey && shouldUseMockProvider()) {
    return estimateProviderUsage({ ...request, provider: "openai" }, 0.55);
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireProviderKey("openai", apiKey)}`
    },
    body: JSON.stringify({
      model: request.model,
      messages: [{ role: "user", content: request.prompt }]
    })
  });

  if (!response.ok) {
    await parseProviderError(response, "openai");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = payload.choices?.[0]?.message?.content;
  const output =
    typeof message === "string"
      ? message
      : message?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim() ?? "";

  return {
    provider: "openai",
    model: request.model,
    output,
    promptTokens: payload.usage?.prompt_tokens ?? Math.max(1, Math.ceil(request.prompt.length / 4)),
    completionTokens: payload.usage?.completion_tokens ?? Math.max(1, Math.ceil(output.length / 4))
  };
}

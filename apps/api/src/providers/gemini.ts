import type { LlmProviderRequest, LlmProviderResponse } from "../types.js";
import { estimateProviderUsage, fetchWithTimeout, parseProviderError, requireProviderKey, shouldUseMockProvider } from "./shared.js";

export async function generateGeminiResponse(request: LlmProviderRequest): Promise<LlmProviderResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey && shouldUseMockProvider()) {
    return estimateProviderUsage({ ...request, provider: "gemini" }, 0.5);
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${encodeURIComponent(requireProviderKey("gemini", apiKey))}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }]
      })
    }
  );

  if (!response.ok) {
    await parseProviderError(response, "gemini");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";

  return {
    provider: "gemini",
    model: request.model,
    output,
    promptTokens: payload.usageMetadata?.promptTokenCount ?? Math.max(1, Math.ceil(request.prompt.length / 4)),
    completionTokens: payload.usageMetadata?.candidatesTokenCount ?? Math.max(1, Math.ceil(output.length / 4))
  };
}

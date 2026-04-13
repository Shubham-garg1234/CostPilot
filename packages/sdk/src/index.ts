export type TrackLLMInput = {
  userId: string;
  orgId: string;
  category: string;
  feature?: string;
  role?: string;
  model?: string;
  provider?: "openai" | "anthropic" | "gemini";
  source?: "sdk" | "cursor" | "chrome_extension" | "copilot" | "claude" | "codex" | "mcp" | "other";
  integrationType?: "proxy" | "mcp" | "extension" | "direct" | "import" | "observability";
  workspaceId?: string;
  sessionId?: string;
  requestId?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
  prompt: string;
};

export type TrackLLMOptions = {
  apiUrl: string;
  apiKey?: string;
};

export async function trackLLM(input: TrackLLMInput, options: TrackLLMOptions) {
  const response = await fetch(`${options.apiUrl}/api/llm-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {})
    },
    body: JSON.stringify({
      ...input,
      source: input.source ?? "sdk",
      integrationType: input.integrationType ?? "proxy"
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? "LLM proxy request failed.");
  }

  return response.json();
}

export async function trackLLMRequest(
  input: TrackLLMInput,
  options: TrackLLMOptions
) {
  return trackLLM(input, options);
}

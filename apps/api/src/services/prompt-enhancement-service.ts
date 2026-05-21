import { getEnvConfig } from "../config.js";
import { calculateCost } from "./costing.js";
import { fetchWithTimeout, parseProviderError, requireProviderKey } from "../providers/shared.js";

type PromptEnhancementInput = {
  prompt: string;
  model?: string;
  targetModel?: string;
  context?: string;
  objective?: string;
};

export type PromptEnhancementResult = {
  provider: "openai";
  model: string;
  originalPrompt: string;
  refinedPrompt: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

const PROMPT_ENHANCER_INSTRUCTIONS = [
  "You are CostPilot's prompt tuning engine for coding assistants such as Cursor.",
  "Rewrite the user's raw request into a precise, implementation-ready prompt.",
  "Preserve the user's intent and do not invent product requirements, files, APIs, secrets, or business rules.",
  "Make vague work actionable by adding clear objective, relevant context, constraints, acceptance criteria, and expected output.",
  "If the user asks for something unsafe, credential-exposing, or destructive, keep the refined prompt safe and ask for explicit confirmation where needed.",
  "Return only the refined prompt text. Do not add explanations before or after it."
].join("\n");

export async function enhancePrompt(input: PromptEnhancementInput): Promise<PromptEnhancementResult> {
  const env = getEnvConfig();
  const model = input.model?.trim() || env.PROMPT_ENHANCEMENT_MODEL;
  const apiKey = resolveOpenAiApiKey();
  const requestPrompt = buildEnhancementPrompt(input);

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireProviderKey("openai", apiKey)}`
    },
    body: JSON.stringify({
      model,
      instructions: PROMPT_ENHANCER_INSTRUCTIONS,
      input: requestPrompt,
      max_output_tokens: 1200
    })
  });

  if (!response.ok) {
    await parseProviderError(response, "openai");
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
  const refinedPrompt = extractResponseText(payload).trim();
  const promptTokens = payload.usage?.input_tokens ?? Math.max(1, Math.ceil(requestPrompt.length / 4));
  const completionTokens = payload.usage?.output_tokens ?? Math.max(1, Math.ceil(refinedPrompt.length / 4));
  const totalTokens = payload.usage?.total_tokens ?? promptTokens + completionTokens;
  const cost = calculateCost(model, promptTokens, completionTokens);

  return {
    provider: "openai",
    model,
    originalPrompt: input.prompt,
    refinedPrompt: refinedPrompt || input.prompt,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: Number(cost.totalCostUsd.toFixed(6))
  };
}

function resolveOpenAiApiKey() {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return openAiKey;
  }

  const providerKey = process.env.LLM_PROVIDER_API_KEY?.trim();
  if (providerKey && providerKey !== "provider_placeholder") {
    return providerKey;
  }

  return undefined;
}

function buildEnhancementPrompt(input: PromptEnhancementInput) {
  const sections = [
    ["Raw prompt", input.prompt],
    ["Target model or agent", input.targetModel],
    ["User objective", input.objective],
    ["Project context", input.context]
  ]
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => `${label}:\n${value!.trim()}`);

  return sections.join("\n\n");
}

function extractResponseText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" || part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

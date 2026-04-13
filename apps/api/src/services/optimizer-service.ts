import { modelCatalog } from "../config.js";

export function generateOptimizationHints(input: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  category: string;
}) {
  const current = modelCatalog[input.model];
  const suggestions: string[] = [];

  if (current?.tier === "premium" && input.category !== "code_generation") {
    suggestions.push("A cheaper standard model may handle this workload without visible quality loss.");
  }

  if (input.promptTokens > input.completionTokens * 3) {
    suggestions.push("Prompt is much larger than the output. Consider trimming system/context tokens.");
  }

  if (input.category === "summarization" && input.model !== "gpt-4o-mini") {
    suggestions.push("Summarization often performs well on low-cost models. Test a mini tier for savings.");
  }

  return suggestions;
}


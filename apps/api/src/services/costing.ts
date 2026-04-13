import { modelCatalog } from "../config.js";

export function calculateCost(model: string, promptTokens: number, completionTokens: number) {
  const pricing = modelCatalog[model] ?? modelCatalog["gpt-4o-mini"];
  const inputCostUsd = (promptTokens / 1000) * pricing.inputPer1k;
  const outputCostUsd = (completionTokens / 1000) * pricing.outputPer1k;

  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd
  };
}

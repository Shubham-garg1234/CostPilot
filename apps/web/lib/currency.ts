/** Display precision for sub-cent LLM costs (10^-5 USD = $0.00001). */
export const MICRO_COST_DECIMALS = 5;

export function formatCostUsd(value: number, decimals = MICRO_COST_DECIMALS) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

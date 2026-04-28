import type { ManagedGatewayKeySummary } from "./managed-gateway-service.js";

export const CURSOR_GATEWAY_API_VERSION = "2024-10-21";

export const CURSOR_MANAGED_DEPLOYMENTS = [
  { deployment: "gpt-4o-mini", model: "gpt-4o-mini", provider: "openai" as const },
  { deployment: "gpt-4.1-mini", model: "gpt-4.1-mini", provider: "openai" as const },
  { deployment: "gpt-4.1", model: "gpt-4.1", provider: "openai" as const }
] as const;

export function buildCursorGatewayBaseUrl(apiBaseUrl: string) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  return `${baseUrl}api/gateway/cursor/openai`;
}

export function buildCursorManagedConfig(
  apiBaseUrl: string,
  input: {
    gatewayKey?: ManagedGatewayKeySummary | null;
    plaintextKey?: string | null;
    complianceState: string;
    lastGovernedRequestAt?: string | null;
  }
) {
  const baseUrl = buildCursorGatewayBaseUrl(apiBaseUrl);

  return {
    provider: "azure-openai-compatible",
    baseUrl,
    apiVersion: CURSOR_GATEWAY_API_VERSION,
    chatCompletionsPath: "/deployments/{deployment}/chat/completions",
    header: "api-key",
    keyStatus: input.gatewayKey?.status ?? "missing",
    apiKey: input.plaintextKey ?? null,
    secretPreview: input.gatewayKey?.secretPreview ?? null,
    deployments: CURSOR_MANAGED_DEPLOYMENTS.map((entry) => ({
      deployment: entry.deployment,
      model: entry.model,
      provider: entry.provider
    })),
    complianceState: input.complianceState,
    lastGovernedRequestAt: input.lastGovernedRequestAt ?? null
  };
}

export function resolveCursorDeployment(deploymentName: string) {
  return CURSOR_MANAGED_DEPLOYMENTS.find((entry) => entry.deployment === deploymentName) ?? null;
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.trim();

  if (!trimmed) {
    return "http://localhost:4000/";
  }

  if (trimmed.startsWith("http://127.0.0.1:4000")) {
    return "http://localhost:4000/";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

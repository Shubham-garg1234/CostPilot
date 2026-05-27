import { IntegrationType, UsageSource } from "../db/types.js";

export const usageSourceValues = [
  "sdk",
  "cursor",
  "chrome_extension",
  "copilot",
  "claude",
  "codex",
  "mcp",
  "other"
] as const;

export const integrationTypeValues = [
  "proxy",
  "mcp",
  "extension",
  "direct",
  "import",
  "observability"
] as const;

export type ApiUsageSource = (typeof usageSourceValues)[number];
export type ApiIntegrationType = (typeof integrationTypeValues)[number];

export function normalizeUsageSource(source?: string | null): UsageSource {
  switch (source) {
    case "cursor":
      return UsageSource.CURSOR;
    case "chrome_extension":
      return UsageSource.CHROME_EXTENSION;
    case "copilot":
      return UsageSource.COPILOT;
    case "claude":
      return UsageSource.CLAUDE;
    case "codex":
      return UsageSource.CODEX;
    case "mcp":
      return UsageSource.MCP;
    case "other":
      return UsageSource.OTHER;
    case "sdk":
    default:
      return UsageSource.SDK;
  }
}

export function normalizeIntegrationType(type?: string | null): IntegrationType {
  switch (type) {
    case "mcp":
      return IntegrationType.MCP;
    case "extension":
      return IntegrationType.EXTENSION;
    case "direct":
      return IntegrationType.DIRECT;
    case "import":
      return IntegrationType.IMPORT;
    case "observability":
      return IntegrationType.OBSERVABILITY;
    case "proxy":
    default:
      return IntegrationType.PROXY;
  }
}

export function serializeUsageSource(source: UsageSource): ApiUsageSource {
  switch (source) {
    case UsageSource.CURSOR:
      return "cursor";
    case UsageSource.CHROME_EXTENSION:
      return "chrome_extension";
    case UsageSource.COPILOT:
      return "copilot";
    case UsageSource.CLAUDE:
      return "claude";
    case UsageSource.CODEX:
      return "codex";
    case UsageSource.MCP:
      return "mcp";
    case UsageSource.OTHER:
      return "other";
    case UsageSource.SDK:
    default:
      return "sdk";
  }
}

export function serializeIntegrationType(type: IntegrationType): ApiIntegrationType {
  switch (type) {
    case IntegrationType.MCP:
      return "mcp";
    case IntegrationType.EXTENSION:
      return "extension";
    case IntegrationType.DIRECT:
      return "direct";
    case IntegrationType.IMPORT:
      return "import";
    case IntegrationType.OBSERVABILITY:
      return "observability";
    case IntegrationType.PROXY:
    default:
      return "proxy";
  }
}

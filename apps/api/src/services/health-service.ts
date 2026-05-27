import type { DependencyState } from "../types.js";

export type ComponentHealth = {
  name: DependencyState["name"];
  status: "running" | "fallback" | "unavailable";
  mode: DependencyState["mode"];
  configured: boolean;
  target: string;
  detail?: string;
  fallback?: string;
};

export function toComponentHealth(state: DependencyState): ComponentHealth {
  if (state.available) {
    return {
      name: state.name,
      status: "running",
      mode: state.mode,
      configured: state.configured,
      target: state.target,
      detail: state.detail
    };
  }

  if (state.fallback) {
    return {
      name: state.name,
      status: "fallback",
      mode: state.mode,
      configured: state.configured,
      target: state.target,
      detail: state.detail,
      fallback: state.fallback
    };
  }

  return {
    name: state.name,
    status: "unavailable",
    mode: state.mode,
    configured: state.configured,
    target: state.target,
    detail: state.detail
  };
}

export function buildHealthPayload(input: {
  service: string;
  environment: string;
  authMode: string;
  dependencyStates: DependencyState[];
  readyForTraffic: boolean;
}) {
  const components = input.dependencyStates.map(toComponentHealth);

  return {
    status: input.readyForTraffic ? "ok" : "degraded",
    service: input.service,
    environment: input.environment,
    authMode: input.authMode,
    readyForTraffic: input.readyForTraffic,
    components
  };
}

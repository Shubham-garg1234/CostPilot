"use client";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
}

export function getStoredDemoToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("costpilot-demo-token") ?? "";
}

export function setStoredDemoToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!token) {
    window.localStorage.removeItem("costpilot-demo-token");
    return;
  }

  window.localStorage.setItem("costpilot-demo-token", token);
}

export function buildAuthHeaders() {
  const token = getStoredDemoToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      ...buildAuthHeaders(),
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

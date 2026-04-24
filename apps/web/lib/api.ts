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

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}

export async function buildAuthHeaders() {
  const headers: Record<string, string> = {};

  const clerkToken = await window.Clerk?.session?.getToken?.().catch(() => null);
  if (clerkToken) {
    headers.Authorization = `Bearer ${clerkToken}`;
  }

  return headers;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
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

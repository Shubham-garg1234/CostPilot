"use client";

const EMPLOYEE_TOKEN_KEY = "costpilot.employeeToken";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export type AuthMode = "auto" | "employee" | "clerk" | "none";

export type RequestJsonOptions = RequestInit & {
  authMode?: AuthMode;
};

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
}

type TokenGetter = () => Promise<string | null>;

let registeredTokenGetter: TokenGetter | null = null;

export function registerTokenGetter(getter: TokenGetter | null) {
  registeredTokenGetter = getter;
}

export function getEmployeeAccessToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? "";
}

export function setEmployeeAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(EMPLOYEE_TOKEN_KEY, token);
}

export function clearEmployeeAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
}

declare global {
  interface Window {
    Clerk?: {
      loaded?: boolean;
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}

export async function buildAuthHeaders(mode: AuthMode = "auto") {
  const headers: Record<string, string> = {};

  if (mode !== "none") {
    const employeeToken = getEmployeeAccessToken();
    if (employeeToken && (mode === "auto" || mode === "employee")) {
      headers.Authorization = `Bearer ${employeeToken}`;
      return headers;
    }
  }

  if (mode === "employee" || mode === "none") {
    return headers;
  }

  const clerkToken =
    (await registeredTokenGetter?.().catch(() => null)) ??
    (window.Clerk?.loaded ? await window.Clerk?.session?.getToken?.().catch(() => null) : null);
  if (clerkToken) {
    headers.Authorization = `Bearer ${clerkToken}`;
  }

  return headers;
}

export async function requestJson<T>(path: string, init?: RequestJsonOptions): Promise<T> {
  const { authMode = "auto", ...requestInit } = init ?? {};
  const authHeaders = await buildAuthHeaders(authMode);
  const response = await fetch(`${getApiBase()}${path}`, {
    ...requestInit,
    headers: {
      ...authHeaders,
      ...(requestInit.headers ?? {})
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

"use client";

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

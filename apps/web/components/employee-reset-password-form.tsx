"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, requestJson } from "../lib/api";
import { Card } from "./ui";

type ResetResponse = {
  ok: boolean;
  message: string;
};

export function EmployeeResetPasswordForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState(
    initialToken
      ? "Choose a new password (at least 8 characters)."
      : "Open the link from your email, or paste the token from the link below."
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setStatus("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = await requestJson<ResetResponse>("/api/auth/employee-reset-password", {
        method: "POST",
        authMode: "none",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password })
      });
      setStatus(payload.message);
      router.replace("/employee/login?notice=password-reset");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = token.trim().length >= 32 && password.length >= 8 && password === confirm;

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 py-10">
      <Card className="p-8">
        <p className="text-sm text-slate-500">Employee account</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Set a new password</h1>
        <p className="mt-3 text-slate-600">Use the link from your email, or paste the token if the link did not open correctly.</p>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm text-slate-600">
            Reset token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="rounded-xl border border-black/10 px-4 py-3 font-mono text-sm"
              placeholder="Token from email link"
              autoComplete="off"
            />
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-black/10 px-4 py-3"
            placeholder="New password (min 8 characters)"
            autoComplete="new-password"
          />
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="rounded-xl border border-black/10 px-4 py-3"
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </div>
        <p className="mt-4 text-sm text-slate-600">{status}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !canSubmit}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
          <Link
            href="/employee/login"
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-slate-700"
          >
            Back to sign in
          </Link>
        </div>
      </Card>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, requestJson } from "../lib/api";
import { Card } from "./ui";

type ForgotResponse = {
  message: string;
};

export function EmployeeForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Enter the work email you use for CostPilot employee sign-in.");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    try {
      setSubmitting(true);
      const payload = await requestJson<ForgotResponse>("/api/auth/employee-forgot-password", {
        method: "POST",
        authMode: "none",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setStatus(payload.message);
      setDone(true);
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 py-10">
      <Card className="p-8">
        <p className="text-sm text-slate-500">Employee account</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Forgot password</h1>
        <p className="mt-3 text-slate-600">
          We will email you a one-time link to choose a new password. The link expires in one hour.
        </p>
        <div className="mt-6 grid gap-4">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-black/10 px-4 py-3"
            placeholder="Work email"
            type="email"
            autoComplete="email"
            disabled={done}
          />
        </div>
        <p className="mt-4 text-sm text-slate-600">{status}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!done ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !email.includes("@")}
              className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          ) : null}
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

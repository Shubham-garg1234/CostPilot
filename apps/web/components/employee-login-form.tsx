"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, requestJson, setEmployeeAccessToken } from "../lib/api";
import { Card } from "./ui";

type LoginResponse = {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    orgId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
  };
};

export function EmployeeLoginForm({ initialNotice }: { initialNotice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    initialNotice === "password-reset"
      ? "Your password was updated. Sign in with your new password."
      : "Use the employee credentials shared by your organization."
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    try {
      setSubmitting(true);
      const payload = await requestJson<LoginResponse>("/api/auth/employee-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      setEmployeeAccessToken(payload.token);
      setStatus(`Signed in to ${payload.user.organizationName} as ${payload.user.fullName}`);
      router.push("/employee");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 py-10">
      <Card className="p-8">
        <p className="text-sm text-slate-500">Employee Login</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Sign in with your employee credentials</h1>
        <p className="mt-3 text-slate-600">
          Your organization adds you to CostPilot and shares your email and password. Use them here to open your employee dashboard and MCP setup.
        </p>
        <div className="mt-6 grid gap-4">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-black/10 px-4 py-3"
            placeholder="Work email"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-black/10 px-4 py-3"
            placeholder="Password"
          />
          <div className="-mt-2 flex justify-end">
            <Link href="/employee/forgot-password" className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600">{status}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void submit()}
            disabled={submitting || !email.includes("@") || password.length < 6}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Signing in..." : "Employee Sign In"}
          </button>
          <Link
            href="/organization/login"
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-slate-700"
          >
            Organization login
          </Link>
        </div>
      </Card>
    </main>
  );
}

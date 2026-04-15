"use client";

import { useState } from "react";
import { Card, Pill } from "./ui";
import { ApiError, requestJson } from "../lib/api";

export function ProxyPlayground() {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [category, setCategory] = useState("chat");
  const [feature, setFeature] = useState("assistant");
  const [prompt, setPrompt] = useState("Summarize this customer escalation and recommend next steps.");
  const [result, setResult] = useState<string>("Run a governed request to see provider routing, usage tracking, and policy enforcement.");
  const [isRunning, setIsRunning] = useState(false);

  async function run() {
    try {
      setIsRunning(true);
      const payload = await requestJson("/api/llm-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider,
          model,
          category,
          feature,
          prompt
        })
      });
      setResult(JSON.stringify(payload, null, 2));
    } catch (error) {
      if (error instanceof ApiError) {
        setResult(JSON.stringify({ status: "error", message: error.message, payload: error.payload }, null, 2));
      } else {
        setResult(JSON.stringify({ status: "error", message: "Unexpected error" }, null, 2));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Multi-Provider Proxy</p>
          <h2 className="font-display text-2xl font-semibold">OpenAI, Anthropic, and Gemini through one endpoint</h2>
        </div>
        <Pill>POST /api/llm-proxy</Pill>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <select value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2">
          {["openai", "anthropic", "gemini"].map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <input value={model} onChange={(event) => setModel(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
        <input value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
        <input value={feature} onChange={(event) => setFeature(event.target.value)} className="rounded-xl border border-black/10 px-3 py-2" />
      </div>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-4 min-h-28 w-full rounded-[20px] border border-black/10 bg-white px-4 py-3 text-sm" />
      <button onClick={() => void run()} disabled={isRunning} className="mt-4 rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
        {isRunning ? "Running..." : "Run Governed Request"}
      </button>
      <pre className="mt-5 overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100">{result}</pre>
    </Card>
  );
}

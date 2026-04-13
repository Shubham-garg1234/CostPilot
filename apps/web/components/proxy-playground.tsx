"use client";

import { useState } from "react";
import { Card, Pill } from "./ui";
import { buildAuthHeaders, getApiBase } from "../lib/api";

export function ProxyPlayground() {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [category, setCategory] = useState("chat");
  const [feature, setFeature] = useState("assistant");
  const [prompt, setPrompt] = useState("Summarize this customer escalation and recommend next steps.");
  const [result, setResult] = useState<string>("Run a governed request to see provider routing, usage tracking, and policy enforcement.");

  async function run() {
    const response = await fetch(`${getApiBase()}/api/llm-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({
        provider,
        model,
        category,
        feature,
        prompt
      })
    });
    const payload = await response.json();
    setResult(JSON.stringify(payload, null, 2));
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
      <button onClick={() => void run()} className="mt-4 rounded-full bg-black px-5 py-2 text-sm font-medium text-white">
        Run Governed Request
      </button>
      <pre className="mt-5 overflow-auto rounded-[20px] bg-stone-950 p-4 text-xs text-stone-100">{result}</pre>
    </Card>
  );
}


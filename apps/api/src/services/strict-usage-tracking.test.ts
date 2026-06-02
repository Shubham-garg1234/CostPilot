import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCodingAgentTrackingContext, validateStrictCodingAgentUsage } from "./strict-usage-tracking.js";

describe("strict usage tracking", () => {
  it("detects coding-agent MCP contexts", () => {
    assert.equal(isCodingAgentTrackingContext("cursor", "mcp"), true);
    assert.equal(isCodingAgentTrackingContext("sdk", "direct"), false);
  });

  it("accepts complete exact metadata", () => {
    const result = validateStrictCodingAgentUsage({
      rawBody: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costUsd: 0.01,
        sessionId: "session-1",
        requestId: "turn-1",
        source: "cursor",
        integrationType: "mcp"
      },
      provider: "openai",
      model: "gpt-4.1",
      source: "cursor",
      integrationType: "mcp",
      sessionId: "session-1",
      requestId: "turn-1",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      costUsd: 0.01,
      metadata: { agent: { name: "cursor", exact: true } }
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.agentMetadata.agent as { exact: boolean }).exact, true);
    }
  });

  it("rejects missing exact fields", () => {
    const result = validateStrictCodingAgentUsage({
      rawBody: {
        promptTokens: 100,
        completionTokens: 50
      },
      provider: "openai",
      model: "gpt-4.1",
      source: "cursor",
      integrationType: "mcp",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      costUsd: 0.01
    });

    assert.equal(result.ok, false);
  });

  it("rejects mismatched totalTokens", () => {
    const result = validateStrictCodingAgentUsage({
      rawBody: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 999,
        costUsd: 0.01,
        sessionId: "s",
        requestId: "r"
      },
      provider: "openai",
      model: "gpt-4.1",
      source: "cursor",
      integrationType: "mcp",
      sessionId: "s",
      requestId: "r",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 999,
      costUsd: 0.01
    });

    assert.equal(result.ok, false);
  });
});

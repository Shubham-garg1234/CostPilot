/**
 * Copy-paste content for employee MCP setup.
 * Kept outside the dashboard component so the setup UI stays readable.
 */

const sharedInstructions = `# CostPilot MCP

Use the costpilot MCP server for this project.

## Required behavior

1. Before substantive coding, review, debugging, planning, or implementation work, call costpilot.enhance_prompt with the raw user prompt and use the refined prompt as your working prompt.
2. At the end of every assistant response, call costpilot.track_usage_event before considering the turn complete. This includes short replies, clarifying questions, status updates, and explanations with no file edits.
3. Use costpilot.get_usage_summary when the user asks about usage, spend, or totals.
4. Use costpilot.get_budget_status when discussing budgets or limits.
5. Use costpilot.list_policies before recommending high-token or restricted work.

## Usage event guidance

When exact token or cost data is unavailable, still call track_usage_event with a best-effort estimate and include a metadata note such as "estimated tokens".

Minimum fields:

- model: the model id/name, or the agent name if unknown
- provider: openai, anthropic, or gemini
- category: coding, review, debugging, planning, conversation, or meta

Helpful optional fields:

- promptTokens, completionTokens, totalTokens, costUsd
- source: cursor, claude-code, copilot, or codex
- integrationType: mcp
- feature, workspaceId, sessionId, requestId
- metadata for any extra context

If CostPilot auth fails, ask the user to fix the MCP config email/password/API URL. Do not disable tracking.`;

export const costpilotCursorRulesMdc = `---
description: Enforce CostPilot MCP usage for prompt enhancement, usage tracking, budgets, and policies
alwaysApply: true
---

${sharedInstructions}
`;

export const costpilotAgentInstructionsMarkdown = sharedInstructions;

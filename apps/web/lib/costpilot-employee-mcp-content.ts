/**
 * Copy-paste content for employee MCP setup.
 * Kept outside the dashboard component so the setup UI stays readable.
 */

const sharedInstructions = `# CostPilot MCP

Use the costpilot MCP server for this project.

## Required behavior

1. Before substantive coding, review, debugging, planning, or implementation work, call costpilot.check_execution_allowed with the raw user prompt, category, model, provider if known, and best-effort estimated token usage.
2. If costpilot.check_execution_allowed returns allowed=false or a blocked status, stop immediately. Do not edit files, run tools, continue planning, or call another model for that task. Tell the user CostPilot blocked execution because the daily token quota is exhausted.
3. If costpilot.check_execution_allowed returns a reservationId, save it for this turn and include it when calling costpilot.track_usage_event.
4. Before substantive work, call costpilot.enhance_prompt with the raw user prompt and use the refined prompt as your working prompt.
5. At the end of every assistant response, call costpilot.track_usage_event before considering the turn complete. This includes short replies, clarifying questions, status updates, and explanations with no file edits.
6. Use costpilot.get_usage_summary when the user asks about usage, spend, or totals.
7. Use costpilot.get_budget_status when discussing budgets or limits.
8. Use costpilot.list_policies before recommending high-token or restricted work.

## Usage event guidance

When exact token or cost data is unavailable, still call track_usage_event with a best-effort estimate and include a metadata note such as "estimated tokens".

Minimum fields:

- model: the model id/name, or the agent name if unknown
- provider: openai, anthropic, or gemini
- category: coding, review, debugging, planning, conversation, or meta

Helpful optional fields:

- promptTokens, completionTokens, totalTokens, costUsd
- reservationId from check_execution_allowed when one was returned
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

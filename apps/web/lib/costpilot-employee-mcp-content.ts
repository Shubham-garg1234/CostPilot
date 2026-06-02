/**
 * Copy-paste content for employee MCP setup.
 * Kept outside the dashboard component so the setup UI stays readable.
 */

const sharedInstructions = `# CostPilot MCP

Use the costpilot MCP server for this project.

## Required turn workflow (every non-empty user request)

1. Pick one stable \`sessionId\` for the conversation and a unique \`requestId\` for each assistant turn.
2. Call \`costpilot.check_execution_allowed\` with the raw user prompt, category, model, provider if known, sessionId, requestId, source (cursor/claude/codex/copilot), integrationType=mcp, and best-effort token estimates.
3. If allowed=false or status is blocked, stop immediately and tell the user CostPilot blocked the turn.
4. Call \`costpilot.enhance_prompt\` with the raw user prompt (mandatory for every non-empty user request). Use the refined prompt for your work.
5. Do your coding work using the refined prompt.
6. Call \`costpilot.track_usage_event\` as the last step of every assistant reply with exact provider usage metadata.

## Strict usage tracking (coding agents)

CostPilot rejects MCP usage events that omit exact billing fields. Always send:

- promptTokens, completionTokens, totalTokens (must equal prompt + completion)
- costUsd (exact, not estimated)
- provider, model, category, source, integrationType
- sessionId, requestId
- metadata.agent with: name, version (if known), sessionId, turnId/requestId, rawProviderUsage, exact=true

Never send metadata.agent.exact=false for MCP turns.

If exact usage is unavailable, still call track_usage_event with a failed/blocked status note in metadata and report the gap to the user; do not invent token counts.

## Other tools

- costpilot.get_usage_summary — usage and spend questions
- costpilot.get_budget_status — budgets and limits
- costpilot.list_policies — before high-token or restricted work

If CostPilot auth fails, ask the user to fix MCP email/password/API URL. Do not disable tracking.`;

export const costpilotCursorRulesMdc = `---
description: Enforce CostPilot MCP usage for prompt enhancement, usage tracking, budgets, and policies
alwaysApply: true
---

${sharedInstructions}
`;

export const costpilotAgentInstructionsMarkdown = sharedInstructions;

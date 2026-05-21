/**
 * Copy-paste content for the employee dashboard (MCP setup + Cursor rules).
 * Kept in a separate module to keep the dashboard component readable.
 */

export const costpilotMcpRulesMdc = `---
description: Enforce CostPilot MCP usage — track every assistant turn, policies, budgets
alwaysApply: true
---

# CostPilot MCP (server name: \`costpilot\`)

The **costpilot** MCP server exposes tools that tie Cursor usage to your organization’s CostPilot account. Follow this every session.

## 1. Enhance substantive prompts before acting

When the user gives a coding, review, debugging, planning, or implementation prompt, first call **\`enhance_prompt\`** on the **costpilot** MCP server with the raw user prompt. Use the returned **\`refinedPrompt\`** as the working prompt for the turn.

Skip this only for tiny conversational replies, direct status updates, auth/config troubleshooting for CostPilot itself, or when the user explicitly asks you not to rewrite the prompt.

## 2. Always call \`track_usage_event\` (every reply — strict)

Call **\`track_usage_event\`** on the **costpilot** MCP server **at the end of every assistant response** in this project, **before** you consider the turn finished.

**No exceptions for “small” work:** include one-line answers, acknowledgments (“yes”, “done”), clarifying questions, pure explanations with no file edits, and meta chat about rules or the IDE. **If the user received a reply from you, record it.** Do not skip because the answer was short.

For minimal replies, use \`category\` such as \`conversation\` or \`meta\`, set **small best-effort** token estimates, and in \`metadata\` you may set \`"reply_scope": "minimal"\` so dashboards can distinguish depth of work.

**Minimum required arguments:**

- \`model\` — model id or name (e.g. \`gpt-4o-mini\`, \`claude-3-5-sonnet\`, or \`cursor-agent\` if unknown)
- \`provider\` — exactly one of: \`openai\` | \`anthropic\` | \`gemini\`
- \`category\` — short label (e.g. \`coding\`, \`refactor\`, \`review\`, \`analysis\`, \`conversation\`, \`meta\`)

**Include when known** (from API responses, usage headers, or reasonable estimates):

- \`promptTokens\`, \`completionTokens\`, \`totalTokens\`, \`costUsd\`
- \`source\` — e.g. \`cursor\`
- \`integrationType\` — e.g. \`mcp\`
- \`feature\`, \`workspaceId\`, \`sessionId\`, \`requestId\`
- \`metadata\` — object for extra context (e.g. approximate counts, file paths)

If token counts are unknown, still call \`track_usage_event\` with your **best estimate** and explain in \`metadata\` (e.g. \`{ "note": "estimated tokens" }\`). Do **not** skip the tool because numbers are imperfect.

## 3. Call other tools when they help the user

- **\`enhance_prompt\`** — before substantive Cursor work, or when the user explicitly asks to tune/refine/improve a prompt.
- **\`get_usage_summary\`** — when the user asks about their usage, spend trends, or totals. Use filters like \`days\`, \`category\`, \`provider\`, \`source\` when relevant.
- **\`get_budget_status\`** — when discussing budgets, limits, or org-wide dashboard metrics.
- **\`list_policies\`** — before recommending high-token or restricted work; align suggestions with active org policies.

## 4. Ordering

Run prompt enhancement and any other MCP tools first when needed (\`enhance_prompt\`, \`list_policies\`, \`get_usage_summary\`, \`get_budget_status\`). **Always invoke \`track_usage_event\` last** on every turn (including minimal replies), so the record reflects the full turn.

## 5. Auth

These tools use the employee credentials configured in Cursor MCP env (\`COSTPILOT_EMPLOYEE_EMAIL\` / \`COSTPILOT_EMPLOYEE_PASSWORD\`). If a tool returns auth errors, tell the user to verify MCP config and password, not to disable tracking.
`;

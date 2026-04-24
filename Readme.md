# CostPilot AI

CostPilot AI is a full-stack control plane for AI usage tracking, proxying, spend visibility, and policy enforcement. It can sit in front of model providers as a governed proxy, ingest direct usage events from tools that cannot be fully proxied, and expose an MCP server so editors and agents can report usage into the same system.

This repo now supports:

- LLM proxying through `POST /api/llm-proxy`
- raw source-aware usage event ingestion through `POST /api/usage-events`
- usage breakdowns by `source`, `provider`, `category`, `feature`, `workspace`, and `session`
- Clerk-backed auth
- a local MCP server package for Cursor and other MCP-capable tools
- a Next.js dashboard for spend, policy, and operational views

## Architecture

CostPilot is built around one normalized usage model:

- `provider`: the upstream model vendor like OpenAI, Anthropic, or Gemini
- `source`: where the usage came from like `cursor`, `codex`, `claude`, `copilot`, `chrome_extension`, `sdk`
- `category`: the business workflow like `chat`, `code_generation`, `research`
- `feature`: the product surface like `assistant`, `autocomplete`, `review`, `sidebar`
- `workspaceId`, `sessionId`, `requestId`: correlation fields for editor and agent sessions

There are two ingestion paths:

1. Proxy path
- the client sends prompt + model + metadata to CostPilot
- CostPilot enforces policy, calculates spend, records a raw `UsageEvent`, writes aggregate rows, and returns the model response

2. Direct event path
- the client already performed the model call or only has observability data
- the client sends token and spend metadata to `POST /api/usage-events`
- CostPilot records the event in the same schema so dashboards and reports stay unified

## Monorepo Structure

```text
apps/
  api/        Fastify API, auth, policy engine, proxy routes, usage event routes
  web/        Next.js dashboard
packages/
  sdk/        Simple client SDK for tracked proxy requests
  mcp/        Local MCP server that forwards tool calls to CostPilot API
prisma/       Prisma schema and seed data
```

## What Was Added

This repo now includes the foundation for multi-tool tracking:

- `UsageEvent` raw event storage in Prisma
- `source` and `integrationType` on aggregate records
- source-aware dashboard summaries
- `POST /api/usage-events`
- `GET /api/usage-events/summary`
- `GET /api/usage-events/recent`
- source metadata support in the SDK and proxy route
- a local MCP server in `packages/mcp`
- real Clerk token verification in the API instead of simple bearer string matching

## Local Setup

### 1. Install and configure

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
docker-compose up -d
pnpm install
```

### 2. Required environment variables

Frontend variables live in `apps/web/.env.local`:

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
CLERK_PUBLISHABLE_KEY="pk_test_xxx"
```

Backend variables live in `apps/api/.env` and should be copied from `apps/api/.env.example`.

Hosted production on Render should not reuse the local defaults. Set `AUTH_MODE=clerk` and keep `POSTGRES_MODE`, `REDIS_MODE`, and `CLICKHOUSE_MODE` all at `required`.

### 3. Prepare the database

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

The API also runs `prisma migrate deploy` automatically on startup, so a fresh environment can create the PostgreSQL tables without a separate manual migration step as long as `DATABASE_URL` and `DIRECT_URL` are configured.

The Prisma schema now stores both:

- `UsageEvent`: immutable raw usage records
- `UsageAggregate`: query-friendly summary rows

### 4. Start the apps

```bash
pnpm dev:api
pnpm dev:web
```

Optional:

```bash
pnpm dev:mcp
```

## Vercel deployment (separate frontend/backend projects)

Use two Vercel projects connected to the same repository:

1. `costpilot-web`
   - Root Directory: `apps/web`
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Add variables from `apps/web/.env.example` in Vercel project settings

2. `costpilot-api`
   - Root Directory: `apps/api`
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Add variables from `apps/api/.env.example` in Vercel project settings

Important:
- use `pnpm` consistently in Vercel for this monorepo
- do not mix `npm` lockfiles for one app and `pnpm` workspace for the repo

## Render deployment

This repo now includes a root `render.yaml` for a two-service Render setup:

1. `costpilot-api`
   - Root directory: `apps/api`
   - Must run with `AUTH_MODE=clerk`
   - Must have `DATABASE_URL`, `REDIS_URL`, and `CLICKHOUSE_URL` configured to hosted services
   - Uses `POSTGRES_MODE=required`, `REDIS_MODE=required`, and `CLICKHOUSE_MODE=required`

2. `costpilot-web`
   - Root directory: `apps/web`
   - Needs `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, and `CLERK_PUBLISHABLE_KEY`

Required API variables for Render:

- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `CLICKHOUSE_URL`
- `CLICKHOUSE_USERNAME`
- `CLICKHOUSE_PASSWORD`
- `CLICKHOUSE_DATABASE`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_AUTHORIZED_PARTIES`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`

Dependency behavior on hosted Render:

- `/health` is liveness only
- `/ready` returns dependency readiness and fails with HTTP `503` if any required dependency is unavailable
- PostgreSQL, Redis, and ClickHouse failures no longer silently downgrade the hosted app into demo behavior

## Authentication

CostPilot is now Clerk-only:

```env
AUTH_MODE=clerk
CLERK_SECRET_KEY=sk_live_or_test_xxx
CLERK_JWT_KEY=your_clerk_jwt_public_key
CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
CLERK_AUTHORIZED_PARTIES=http://localhost:3000,http://localhost:4000
```

How Clerk auth works in this repo:

1. The API reads the bearer token.
2. CostPilot verifies it with Clerk using `verifyToken()`.
3. It resolves the Clerk user id from the token `sub`.
4. It loads the Clerk user profile.
5. It links that identity to a CostPilot `User` row by `clerkUserId` or email.

Important:

- a valid Clerk session token is not enough by itself
- the user must also exist in CostPilot's database
- the `users.clerkUserId` column should match the Clerk user id

You can create linked users through the API once you have an authenticated Clerk admin token:

```bash
curl -X POST http://localhost:4000/api/users \
  -H "Authorization: Bearer <clerk-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "YOUR_ORG_ID",
    "email": "user@example.com",
    "fullName": "Example User",
    "role": "ADMIN",
    "clerkUserId": "user_2abc123"
  }'
```

In production, the common pattern is:

- create the Clerk user in Clerk
- create or sync the matching CostPilot user row
- send the Clerk session token to CostPilot-protected API routes

## Proxying Requests Through CostPilot

`POST /api/llm-proxy` is the governed path. It handles:

- auth
- policy checks
- throttling and warnings
- provider dispatch
- token estimation
- cost calculation
- usage event persistence
- aggregate persistence

Example request:

```bash
curl -X POST http://localhost:4000/api/llm-proxy \
  -H "Authorization: Bearer <clerk-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize this PR and suggest review comments.",
    "model": "gpt-4o-mini",
    "provider": "openai",
    "category": "code_generation",
    "feature": "assistant",
    "source": "cursor",
    "integrationType": "proxy",
    "workspaceId": "costpilot-main",
    "sessionId": "cursor-session-001",
    "requestId": "req-001",
    "metadata": {
      "fileCount": 4,
      "branch": "main"
    }
  }'
```

Example response shape:

```json
{
  "status": "ok",
  "enforcement": "allow",
  "usage": {
    "promptTokens": 120,
    "completionTokens": 240,
    "totalTokens": 360,
    "costUsd": 0.000162,
    "source": "cursor",
    "integrationType": "proxy"
  },
  "response": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "output": "..."
  }
}
```

Use the proxy when:

- you control the model request
- you want policy enforcement
- you want the most accurate token and spend attribution in CostPilot

## Ingesting External Usage Events

Some tools cannot be fully proxied. For those, send usage telemetry to `POST /api/usage-events`.

Example:

```bash
curl -X POST http://localhost:4000/api/usage-events \
  -H "Authorization: Bearer <clerk-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-7-sonnet",
    "provider": "anthropic",
    "category": "chat",
    "feature": "assistant",
    "source": "claude",
    "integrationType": "observability",
    "workspaceId": "project-alpha",
    "sessionId": "claude-session-44",
    "requestId": "claude-req-44",
    "promptTokens": 950,
    "completionTokens": 410,
    "metadata": {
      "surface": "desktop-app"
    }
  }'
```

Use the direct event endpoint when:

- the upstream request already happened elsewhere
- you only have self-reported or observed token data
- you still want unified reporting and cost categorization

## Usage Query APIs

### `GET /api/usage-events/summary`

Use this for totals and grouped reporting.

Supported query params:

- `days`
- `source`
- `category`
- `provider`

Example:

```bash
curl "http://localhost:4000/api/usage-events/summary?days=14&source=cursor" \
  -H "Authorization: Bearer <clerk-session-token>"
```

### `GET /api/usage-events/recent`

Returns the latest raw events for the current organization.

### `GET /api/dashboard/summary`

Returns dashboard cards plus:

- `sourceBreakdown`
- `providerBreakdown`
- top users
- top features
- recent violations

## SDK Usage

The SDK wraps the proxy endpoint.

```ts
import { trackLLM } from "@costpilot/sdk";

await trackLLM(
  {
    userId: "user_123",
    orgId: "org_123",
    category: "chat",
    feature: "assistant",
    prompt: "Summarize this incident review.",
    model: "gpt-4o-mini",
    provider: "openai",
    source: "cursor",
    integrationType: "proxy",
    workspaceId: "repo-costpilot",
    sessionId: "cursor-session-22",
    requestId: "req-22"
  },
  {
    apiUrl: "http://localhost:4000",
    apiKey: "<clerk-session-token>"
  }
);
```

The SDK now defaults to:

- `source: "sdk"`
- `integrationType: "proxy"`

when those values are not supplied.

## MCP Server

The MCP server lives in `packages/mcp` and forwards MCP tool calls into the CostPilot API.

### Start it locally

```bash
set COSTPILOT_API_URL=http://127.0.0.1:4000
set COSTPILOT_API_KEY=your_clerk_session_token
pnpm dev:mcp
```

On macOS/Linux:

```bash
export COSTPILOT_API_URL=http://127.0.0.1:4000
export COSTPILOT_API_KEY=your_clerk_session_token
pnpm dev:mcp
```

### MCP tools exposed

- `track_usage_event`
- `get_usage_summary`
- `get_budget_status`
- `list_policies`

### Cursor integration

Cursor supports MCP servers through its MCP config. On Windows, a typical setup looks like:

```json
{
  "mcpServers": {
    "costpilot": {
      "command": "pnpm.cmd",
        "args": ["--dir", "C:\\Users\\Shubham\\Desktop\\CostPilot", "dev:mcp"],
        "env": {
          "COSTPILOT_API_URL": "http://127.0.0.1:4000",
          "COSTPILOT_API_KEY": "your_clerk_session_token"
        }
      }
    }
}
```

What this gives you:

- Cursor can call CostPilot MCP tools directly
- usage events can be reported with `source: "cursor"`
- policy and budget summaries can be pulled into the editor

Recommended Cursor tracking modes:

1. Best mode: proxy actual model traffic through `POST /api/llm-proxy`
2. Fallback mode: emit usage telemetry through MCP `track_usage_event`

## Integrating Other Tools

### Codex

Use either:

- direct proxy calls with `source: "codex"`
- or direct event ingestion if Codex usage is reported from another control layer

### Claude

Use:

- `source: "claude"`
- `integrationType: "observability"` if you only track usage after the fact
- `integrationType: "proxy"` if you own the request path

### GitHub Copilot

Copilot is usually harder to fully proxy. For v1, treat it as:

- `source: "copilot"`
- `integrationType: "observability"` or `direct`

and report token/cost metadata through `POST /api/usage-events` or MCP.

### Chrome extension

The Chrome extension path works best when the extension itself sends prompts through CostPilot. In that case use:

- `source: "chrome_extension"`
- `integrationType: "extension"`

If the extension only watches activity on third-party sites, keep the docs honest and track it as observability, not guaranteed token-accurate billing.

## Policy Engine

Policies are defined by:

- organization
- role
- category
- optional feature
- token/day limit
- request/hour limit
- monthly cost limit
- allowed models
- lock/throttle/warn behavior

You can inspect them with:

```bash
curl http://localhost:4000/api/policies \
  -H "Authorization: Bearer <clerk-session-token>"
```

## Database Notes

The most important tables for this project are:

- `Organization`
- `Team`
- `User`
- `Policy`
- `Violation`
- `UsageEvent`
- `UsageAggregate`
- `BillingRecord`

`UsageEvent` is the source of truth for raw usage. `UsageAggregate` exists to support efficient rollups and dashboard views.

## Recommended Production Flow

1. Authenticate users with Clerk.
2. Sync Clerk users into the CostPilot `User` table.
3. Route AI traffic through `POST /api/llm-proxy` whenever possible.
4. Use `POST /api/usage-events` for non-proxyable tools.
5. Use the MCP server for editor/agent integrations like Cursor.
6. Build dashboards and budget alerts from `UsageEvent` and `UsageAggregate`.

## Current Limitations

- the MCP server currently authenticates with the same bearer token model as the API
- for Clerk mode, that means the caller must provide a valid Clerk session token tied to a CostPilot user
- provider implementations in this starter estimate usage rather than calling live upstream APIs
- Chrome extension, Copilot, Claude, and Codex integrations are foundational patterns here, not full vendor-specific adapters yet

## Next Recommended Steps

If you want to take this from foundation to product, the next best steps are:

1. add real upstream provider calls for OpenAI, Anthropic, and Gemini
2. add a first-class integration config table for per-source credentials and enablement
3. add Clerk webhooks or background sync to auto-provision CostPilot users
4. add a live dashboard page for raw usage event exploration
5. build the first concrete Cursor adapter that sends both proxy traffic and session metadata

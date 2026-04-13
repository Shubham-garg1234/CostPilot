# CostPilot AI

CostPilot AI is a production-oriented full-stack SaaS starter for governed LLM usage. It combines an LLM proxy, RBAC-aware policy enforcement, Redis-backed quota tracking, billing primitives, and an executive dashboard to give organizations control over token spend.

## Included

- Next.js App Router frontend with admin, alerts, policy, and billing views
- Fastify backend with `POST /api/llm-proxy` enforcement middleware
- PostgreSQL data model via Prisma for orgs, teams, users, policies, violations, aggregates, billing, and encrypted API keys
- Redis counters for daily tokens, hourly requests, monthly cost, cooldowns, and temporary bans
- ClickHouse and BullMQ scaffolding for high-volume analytics logging
- Stripe-ready billing service and optimization hint engine
- Simple SDK with `trackLLM()` to route governed requests through the proxy

## Structure

```text
apps/
  api/        Fastify API, policy engine, quota enforcement, billing, dashboard endpoints
  web/        Next.js dashboard and management UI
packages/
  sdk/        Developer SDK for tracked LLM calls
prisma/       Database schema and seed data
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Start infrastructure with `docker-compose up -d`.
3. Install dependencies with `pnpm install`.
4. Run `pnpm prisma:generate` and `pnpm prisma:migrate`.
5. Seed demo data with `pnpm prisma:seed`.
6. Start the apps with `pnpm dev:api` and `pnpm dev:web`.

## Governed proxy example

```json
{
  "prompt": "Draft a support reply for this refund request",
  "model": "gpt-4o-mini",
  "category": "email_generation",
  "feature": "auto_reply",
  "metadata": {
    "ticketId": "SUP-1023"
  }
}
```

Use `Authorization: Bearer demo-admin`, `demo-manager`, or `demo-intern` for the seeded demo users.

## SDK example

```ts
import { trackLLM } from "@costpilot/sdk";

await trackLLM(
  {
    userId: "user_123",
    orgId: "org_123",
    category: "chat",
    feature: "assistant",
    prompt: "Summarize this incident review",
    model: "gpt-4o-mini"
  },
  {
    apiUrl: "http://localhost:4000",
    apiKey: "demo-manager"
  }
);
```

## Implemented governance patterns

- Role-based model restrictions
- Feature locking for sensitive workflows
- Hourly, daily, and monthly quota checks
- Cooldown windows after repeated abuse
- Exponential backoff for throttled requests
- Violation records and alert hooks
- Optimization hints for wasteful prompt usage

## Next upgrades

- Replace demo auth with Clerk middleware and verified org membership
- Attach a real OpenAI-compatible upstream provider in the proxy
- Add ClickHouse worker consumers for queue-backed log ingestion
- Swap static dashboard cards for live API-backed React Server Components
- Expand Stripe usage metering and invoice finalization webhooks

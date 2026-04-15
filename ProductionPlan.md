# CostPilot Production Readiness Plan

## Goal

Turn CostPilot from a strong prototype into a production-grade SaaS product that is safe to deploy on Vercel, resilient under dependency failures, trustworthy for billing/governance, and polished enough to feel like an enterprise SaaS platform.

## Current Audit Snapshot

### What is already in good shape

- Monorepo structure is clean: `apps/web`, `apps/api`, `packages/sdk`, `packages/mcp`, `prisma/`
- TypeScript typecheck passes across API, web, SDK, and MCP
- API build passes
- Prisma schema already models organizations, teams, users, policies, violations, usage events, aggregates, billing, and API keys
- API already has degraded-mode behavior for PostgreSQL, Redis, and ClickHouse outages
- Clerk auth path exists in addition to demo auth

### What is blocking a production launch today

- `AUTH_MODE` defaults to `demo`
- frontend still relies heavily on static/demo data and demo-token local storage
- provider adapters are mocked estimators, not live OpenAI/Anthropic/Gemini integrations
- fallback behavior is mostly "keep app alive" rather than "degrade safely with clear user messaging"
- no test suite or release gates for critical billing/policy flows
- Vercel deployment configuration is incomplete
- `apps/web/next.config.mjs` points `outputFileTracingRoot` to a different repo path
- no first-run onboarding flow for a new organization
- no strong observability, SLOs, audit logging, or incident runbooks
- UX is visually promising but not yet cohesive, data-trustworthy, or enterprise-complete

## Definition Of Production Ready

CostPilot is production ready when all of the following are true:

- live provider requests work end-to-end with retries, timeouts, and well-defined fallback behavior
- auth is production-only by default, with role-safe org provisioning and session handling
- usage, billing, and policy enforcement are accurate, idempotent, and test-covered
- every important page has loading, empty, error, and success states
- Vercel deployment is reproducible with documented env vars and health checks
- monitoring, alerting, logging, and incident-response basics are in place
- a first-time team can onboard without touching source code

## Workstreams

### 1. Platform and deployment hardening

Priority: `P0`

- fix `apps/web/next.config.mjs` so tracing points at this repo root
- define Vercel project structure
- decide whether API stays as a separate Vercel project/service or is folded into the Next.js app via route handlers/server actions
- add environment validation that fails fast in production when required secrets are missing
- remove production defaults that silently use placeholder secrets
- add `vercel.json` only if needed for headers, regions, cron, or rewrites
- add health/readiness endpoints for API dependencies
- document exact Vercel env vars for Preview and Production

Acceptance criteria:

- preview and production deployments are reproducible
- no production deployment can boot with demo auth or placeholder secrets
- health endpoint exposes dependency status without leaking secrets

### 2. Authentication, authorization, and tenant safety

Priority: `P0`

- make `clerk` the required production auth mode
- keep demo mode local-only and clearly disabled on hosted environments
- add server-side org/user bootstrap flow after Clerk sign-in
- enforce organization scoping in every read/write path
- add admin-only organization settings, API key management, and member invites
- store hashed API keys rather than reversible secrets if long-lived org keys are needed

Acceptance criteria:

- no cross-org access is possible
- sign-in, org creation, invite, role assignment, and first-login flows are complete
- audit trails exist for user creation, policy edits, and billing actions

### 3. API reliability and fallback design

Priority: `P0`

- replace provider mocks with live adapters for OpenAI, Anthropic, and Gemini
- add request timeouts, retry policy, provider-specific error normalization, and request IDs
- define fallback rules:
  - provider unavailable: fail over only to approved backup models/providers
  - billing/usage persistence unavailable: queue safely and mark response as partially degraded
  - policy engine unavailable: fail closed for protected routes, not open
  - analytics warehouse unavailable: continue core request path but surface delayed analytics status
- make idempotency mandatory for usage-event and proxy recording via `requestId`
- avoid `setTimeout` throttling in the request thread for large waits; move to explicit rate-limit responses when appropriate
- add structured error responses for frontend and SDK use

Acceptance criteria:

- every API route returns stable success/error shapes
- degraded mode is explicit and safe
- duplicate events do not double-bill
- upstream provider failures are observable and actionable

### 4. Data correctness, billing, and policy trust

Priority: `P0`

- review aggregate write strategy; current `usageAggregate.create` will fragment rows instead of upserting summary buckets
- decide source of truth for cost: provider returned usage vs local cost catalog
- expand model catalog and version it
- add monthly billing reconciliation jobs
- define how markup, invoices, credits, and disputed usage are handled
- add immutable billing snapshots
- add policy simulation mode before publishing policy changes

Acceptance criteria:

- usage totals match raw events
- billing reports can be reproduced from immutable event history
- policy changes are testable and explainable before rollout

### 5. Frontend productization and UX

Priority: `P1`

- replace static homepage/dashboard data with real API-backed queries
- add a proper information architecture:
  - Overview
  - Usage Explorer
  - Policies
  - Alerts
  - Billing
  - Organization Settings
  - Integrations
- add skeletons, empty states, error banners, retry actions, and success toasts
- add onboarding checklist for first-time orgs
- add trust-building details: last synced time, data freshness, degraded status badges, request trace links
- unify visual system with tighter spacing, consistent card hierarchy, stronger navigation states, and mobile-ready responsive behavior
- make forms enterprise-grade: validation, inline help, destructive-action confirmations

Acceptance criteria:

- no page looks demo-only
- all primary flows work on desktop and mobile
- a new admin can understand next actions without docs

### 6. Observability, security, and ops

Priority: `P1`

- add structured logs with request IDs and org IDs
- connect web analytics, runtime logs, and error monitoring
- define SLOs for proxy latency, auth success, usage ingest success, and billing job success
- add alerting for queue depth, provider errors, persistence failures, and auth anomalies
- review CORS policy; `origin: true` is too permissive for production
- add rate limits, abuse protection, and webhook signature verification
- redact secrets and PII from logs

Acceptance criteria:

- on-call can detect and diagnose failures quickly
- production logs are searchable and correlated
- security posture is documented and minimally hardened

### 7. Testing and release process

Priority: `P0`

- add unit tests for policy engine, costing, usage normalization, and auth guards
- add integration tests for:
  - proxy success path
  - blocked policy path
  - duplicate usage event path
  - billing generation
  - organization/user creation
- add end-to-end tests for key UI flows
- require `typecheck`, `build`, tests, and lint before merge/deploy
- add seed fixtures for realistic multi-org demo and staging validation

Acceptance criteria:

- critical business logic has automated coverage
- deployments are gated by CI, not manual confidence

## Recommended Delivery Sequence

### Phase 1: Launch blockers

- fix Next.js production build blocker and Vercel config
- remove demo-first defaults from production path
- ship live provider adapters
- harden proxy/usage persistence/idempotency behavior
- add minimum automated tests for policy, billing, and usage integrity

### Phase 2: SaaS-grade UX and onboarding

- convert demo dashboards to real data
- add onboarding flow, organization settings, invitations, and integrations
- improve empty/error/loading states
- polish layout, navigation, and trust indicators

### Phase 3: Scale, ops, and enterprise confidence

- observability stack
- reconciliation jobs and audit tooling
- admin reporting and export flows
- incident runbooks and SLOs

## Vercel Deployment Blueprint

### Preferred setup

- `apps/web` deployed on Vercel as the primary app
- API either:
  - deployed as a second Vercel project, or
  - merged into the web app if you want one deployment surface

### Required services

- Postgres
- Redis
- optional analytics warehouse
- Clerk
- Stripe
- model provider API keys

### Required environment groups

- local
- preview
- production

### Production env rules

- no placeholder defaults
- no demo auth
- no wildcard CORS
- explicit `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL`

## UX Standard To Target

The product should feel like a serious B2B SaaS control plane:

- clear hierarchy
- calm but premium visual language
- trustworthy numbers
- visible system status
- low-friction onboarding
- precise copy
- consistent interaction patterns

Use these rules:

- every page must answer "what happened, what do I do next, and is my data current?"
- every async action must have loading, success, and failure feedback
- every important metric should show timeframe and freshness
- every destructive change should be confirmable and auditable

## Release Gate Checklist

- web production build passes
- API build passes
- migrations run cleanly on a fresh database
- demo auth disabled in production
- provider integrations tested with real keys in staging
- policy engine test suite green
- billing reconciliation test suite green
- onboarding flow tested by a first-time user
- Vercel preview and production env vars verified
- runtime logging and alerts verified

## Recommended Repo Deliverables

- `UserManual.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/runbooks.md`
- `docs/security.md`
- CI workflow for typecheck/build/test

## Immediate Next Actions

1. Fix the web production build blocker and Vercel config.
2. Replace mocked provider adapters with live integrations.
3. Remove demo-only frontend data and wire real dashboard queries.
4. Add automated tests for policy, usage, and billing correctness.
5. Build onboarding plus first-time organization setup UX.

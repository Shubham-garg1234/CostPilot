# CostPilot

CostPilot is a full-stack AI governance platform for organizations that want to manage LLM usage, employee access, and Cursor-related spend from one control plane.

It gives you:

- an organization admin workspace
- an employee login and self-serve Cursor setup page
- a governed LLM gateway for supported Cursor chat traffic
- a fallback MCP server for observability, reporting, and manual usage imports
- usage, policy, billing, and compliance data backed by Postgres, Redis, and ClickHouse

## Important rollout note

CostPilot currently supports two different Cursor-related paths:

1. Managed Cursor Gateway (preferred)
   - Employees use a CostPilot-issued managed key and a CostPilot gateway endpoint.
   - Supported Cursor chat requests are recorded inline before the successful model response is returned.
   - Compliance can be observed automatically when a governed request is seen.

2. MCP fallback
   - Employees can connect the local CostPilot MCP server to Cursor.
   - This is useful for usage visibility, policy lookup, budget checks, and manual event ingestion.
   - This is not the main enforcement boundary for governed Cursor chat traffic.

Important limitation: Cursor's official API key docs say custom API keys only work with standard chat models, and features that require Cursor's specialized models continue using Cursor-managed models. In practice, that means CostPilot can govern supported chat flows, but not every single Cursor feature end-to-end yet.

References:

- [Cursor API Keys](https://docs.cursor.com/advanced/api-keys)
- [Cursor MCP](https://docs.cursor.com/en/context/mcp)

## What is in this repo

```text
apps/
  api/   Fastify API, managed Cursor gateway, and MCP server
  web/   Next.js admin + employee UI
packages/
  sdk/   Small helper SDK for governed LLM requests
prisma/  Prisma schema and migrations
scripts/ Development helpers
bin/     Packaged MCP client entrypoint
```

## High-level architecture

- `apps/web`
  - Organization admin UI
  - Employee login UI
  - Employee dashboard with managed Cursor config and fallback MCP config

- `apps/api`
  - Clerk-backed org/admin auth
  - Employee email/password auth
  - Policy enforcement
  - Usage event persistence
  - Managed Cursor gateway routes
  - MCP tools for summary, budget, policy lookup, and manual ingestion

- `Postgres`
  - Organizations, teams, users, policies, violations, billing records, usage events, managed gateway keys

- `Redis`
  - Request counter / policy support infrastructure

- `ClickHouse`
  - Analytics mirror for usage events

## Who does what

### You / platform owner

You are responsible for:

- deploying the API and web app
- provisioning Postgres, Redis, and ClickHouse
- setting Clerk up for admin access
- setting model provider keys
- deciding whether governed Cursor is required or optional
- configuring SMTP if you want automatic employee credential emails
- validating that governed requests, usage tracking, and compliance updates work in production

### Organization admin

The organization admin is responsible for:

- signing in through Clerk
- naming the organization and setting the slug
- creating teams
- adding employees
- creating policies
- issuing, rotating, or revoking managed Cursor keys
- deciding whether governed Cursor is required for employees

### Employee

Each employee is responsible for:

- signing in with the credentials shared by the organization
- opening the employee dashboard
- copying the managed Cursor configuration
- using the governed setup in Cursor for supported chat workflows
- using MCP only as a fallback or observability helper when needed

## What you need to do before rollout

Use this as your rollout checklist.

### 1. Decide your operating model

Pick one of these rollout modes:

- Recommended: Managed Cursor gateway for supported chat traffic + MCP only for observability
- Transitional: MCP first, then move employees to managed gateway

If your goal is strict governance for every Cursor capability, be careful: the current Cursor product model does not let CostPilot govern every built-in Cursor feature yet.

### 2. Provision infrastructure

You need:

- PostgreSQL
- Redis
- ClickHouse
- Clerk
- OpenAI and/or Anthropic and/or Gemini API keys

For local development you can start the data stores with:

```bash
docker compose up -d
```

### 3. Configure environment variables

The main API env file is [`apps/api/.env.example`](./apps/api/.env.example).

Required for local and production:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma database connection |
| `DIRECT_URL` | Direct Postgres connection for migrations |
| `REDIS_URL` | Redis connection |
| `CLICKHOUSE_URL` | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USERNAME` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | ClickHouse database |
| `CLERK_SECRET_KEY` | Clerk backend auth |
| `CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `CLERK_JWT_KEY` | Clerk JWT verification |
| `CLERK_AUTHORIZED_PARTIES` | Allowed Clerk frontend origins |
| `EMPLOYEE_AUTH_SECRET` | Signs employee access tokens |
| `MANAGED_GATEWAY_ENCRYPTION_SECRET` | Encrypts managed Cursor keys at rest |
| `NEXT_PUBLIC_APP_URL` | Public web URL |
| `NEXT_PUBLIC_API_URL` | Public API URL |
| `OPENAI_API_KEY` or `LLM_PROVIDER_API_KEY` | OpenAI-compatible provider key for governed gateway requests |

Required if you plan to serve real model traffic:

- `OPENAI_API_KEY` or `LLM_PROVIDER_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`

Optional but recommended:

- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SLACK_WEBHOOK_URL`

### 4. Run Prisma

Generate Prisma client:

```bash
pnpm prisma:generate
```

Apply schema changes locally:

```bash
pnpm prisma:migrate
```

If you only need to sync schema in local development:

```bash
pnpm prisma db push --schema prisma/schema.prisma
```

For production, use migration deployment instead of `db push`.

### 5. Start the apps locally

Start the API and colocated MCP server:

```bash
pnpm dev:api
```

Start only the HTTP API:

```bash
pnpm dev:api:http
```

Start only the MCP process:

```bash
pnpm dev:api:mcp
```

Start the web app:

```bash
pnpm dev:web
```

### 6. Validate baseline health

Check:

- `GET /health`
- `GET /ready`

`/ready` includes dependency status and MCP heartbeat visibility.

## First-time bootstrap flow

When there are no organizations and no users yet:

1. Sign in once through Clerk at `/organization/login`.
2. CostPilot auto-creates:
   - one organization
   - one admin user
3. Go to `/organization/manage`.
4. Rename the auto-created workspace to your real organization name and slug.

After teams, users, policies, billing, or usage data exist, the organization name and slug should be treated as stable identifiers.

## Organization admin runbook

This is the process your internal admin should follow.

### Step 1. Sign in

- Go to `/organization/login`
- Sign in with Clerk
- Land in the organization workspace

### Step 2. Save organization details

Go to `/organization/manage` and set:

- organization name
- organization slug

This is the tenant identity employees and reports will belong to.

### Step 3. Create teams

Create at least one team before adding employees.

Each employee must belong to a team in the current UI flow.

### Step 4. Add employees

For each employee, the admin enters:

- full name
- work email
- role
- team

CostPilot then:

- creates the employee user
- generates a temporary password
- hashes it and stores it
- emails it automatically if SMTP is configured
- otherwise returns the temporary password in the admin UI for manual sharing

### Step 5. Decide whether governed Cursor is required

Toggle governed Cursor on or off from the organization manager:

- `Required` means the organization expects employees to use the governed managed gateway for supported chat traffic.
- `Optional` means employees can still use it, but the org is not enforcing that expectation operationally.

This is a governance signal in CostPilot. It is not the same thing as hard technical control over every Cursor feature.

### Step 6. Issue managed Cursor keys

For every employee who should use governed Cursor:

1. Issue a managed key
2. Share the key only through the employee dashboard flow
3. Rotate the key if the employee changes device or you suspect exposure
4. Revoke the key if access should end

The admin UI already supports:

- issue
- rotate
- revoke
- manual compliance marking

### Step 7. Verify compliance

Compliance becomes useful after the first real governed request.

An employee becomes automatically compliant when CostPilot sees a managed gateway request for that employee.

You can also manually mark:

- `COMPLIANT`
- `NON_COMPLIANT`

Use the manual buttons only as an operational override, not as your main proof of enforcement.

## Employee runbook

This is the process each employee should follow.

### Step 1. Sign in

Go to `/employee/login` and use:

- work email
- temporary password provided by the organization

After login, the employee lands on `/employee`.

### Step 2. Open the employee dashboard

The dashboard shows:

- total requests
- total tokens
- total cost
- recent usage events
- compliance state
- managed Cursor gateway configuration
- fallback MCP configuration

### Step 3. Use the preferred managed Cursor setup

Use the values shown in the employee dashboard under "Managed Cursor Gateway".

CostPilot currently returns:

- provider: `azure-openai-compatible`
- base URL: CostPilot managed gateway base
- API version: `2024-10-21`
- auth header: `api-key`
- deployment names:
  - `gpt-4o-mini`
  - `gpt-4.1-mini`
  - `gpt-4.1`

In Cursor, the employee should:

1. Open `Cursor Settings`
2. Open the `Models` section
3. Use the Azure OpenAI or equivalent OpenAI-compatible custom provider path exposed by that Cursor version
4. Paste the managed gateway key from the employee dashboard
5. Paste the managed base URL from the employee dashboard
6. Use the API version from the employee dashboard
7. Select one of the supported deployment names shown in the employee dashboard
8. Save and test with a simple chat request

Recommended first test:

- ask Cursor to summarize a file
- return to CostPilot
- confirm:
  - recent usage appears
  - `last governed request` updates
  - compliance can move to `COMPLIANT`

### Step 4. Use fallback MCP only when needed

If the employee needs CostPilot tools in Cursor, they can use the fallback MCP config shown in the dashboard.

Cursor's official MCP docs say project config lives in:

- `.cursor/mcp.json` for project-only tools
- `~/.cursor/mcp.json` for global tools

Typical fallback MCP config:

```json
{
  "mcpServers": {
    "costpilot": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "--package=github:Shubham-garg1234/CostPilot_MCP",
        "costpilot-mcp"
      ],
      "env": {
        "COSTPILOT_API_URL": "https://your-api-domain",
        "COSTPILOT_EMPLOYEE_EMAIL": "employee@company.com",
        "COSTPILOT_EMPLOYEE_PASSWORD": "paste-your-password-here"
      }
    }
  }
}
```

MCP tools currently exposed:

- `get_usage_summary`
- `get_budget_status`
- `list_policies`
- `track_usage_event`

## What is already implemented correctly

The current repo already has these important pieces in place:

- separate admin and employee auth flows
- Clerk-based org/admin auth
- employee credential login
- temporary password generation
- managed gateway key issuance, rotation, and revocation
- governed Cursor gateway endpoints
- employee dashboard with managed key visibility
- usage event storage and analytics mirroring
- compliance tracking fields in Prisma
- fallback MCP transport for observability/manual imports

## What was missing or misleading and has now been corrected

These gaps were corrected in this repo:

- the fallback MCP config now uses the public API base URL from the employee dashboard instead of relying on a possibly missing process env
- the fallback MCP config now uses the explicit `costpilot-mcp` binary invocation
- SMTP settings were added back into `apps/api/.env.example`
- `render.yaml` now includes the missing production env vars for employee auth, managed gateway key encryption, and SMTP-related config
- employee and admin UI copy now makes it clear that governed Cursor coverage applies to supported chat traffic, not every Cursor-native feature
- credential email copy now points employees to the governed Cursor setup, not only MCP

## Things you should still plan next

These are still good next steps if you want this to be production-ready for a larger company:

- add employee password reset / change-password flow
- add employee invitation acceptance instead of sharing raw temporary passwords
- add stronger compliance proof than manual marking alone
- add SSO or SCIM for employees if you want enterprise-grade identity management
- add audit logs for key issue / rotate / revoke actions
- add support docs or screenshots for the exact Cursor version your company standardizes on
- decide whether you want to govern only chat usage or broader AI surface area beyond Cursor

## Local development checklist

Use this sequence:

```bash
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev:api
pnpm dev:web
```

Then verify:

- web app opens on `http://localhost:3000`
- API opens on `http://localhost:4000/health`
- `/organization/login` works after Clerk is configured
- `/employee/login` works after an employee is created

## Production deployment checklist

Before calling the rollout complete, make sure all of this is true:

- API deploys successfully in production
- web deploys successfully in production
- Prisma migrations ran successfully
- Postgres is reachable
- Redis is reachable
- ClickHouse is reachable
- Clerk sign-in works
- first admin workspace bootstraps correctly
- admin can create a team
- admin can create an employee
- SMTP works or the manual password-sharing process is documented
- admin can issue a managed Cursor key
- employee can log in
- employee can see managed config
- employee can make a governed request
- usage shows up in Postgres and ClickHouse-backed dashboards
- compliance updates after first governed request

## Main web routes

- `/` -> redirects to employee login
- `/organization/login` -> org admin sign-in
- `/organization` -> org dashboard overview
- `/organization/manage` -> org setup, teams, users, managed keys
- `/employee/login` -> employee sign-in
- `/employee` -> employee dashboard
- `/policies` -> policy management
- `/billing` -> billing dashboard
- `/alerts` -> alerts dashboard

## Main API routes

- `POST /api/auth/employee-login`
- `GET /api/auth/session`
- `GET /api/auth/employee-dashboard`
- `GET /api/organizations/current`
- `POST /api/organizations`
- `POST /api/teams`
- `POST /api/users`
- `POST /api/policies`
- `POST /api/llm-proxy`
- `POST /api/usage-events`
- `GET /api/usage-events/summary`
- `POST /api/managed-gateway/keys`
- `POST /api/managed-gateway/keys/:keyId/rotate`
- `POST /api/managed-gateway/keys/:keyId/revoke`
- `PATCH /api/managed-gateway/governance/cursor`
- `PATCH /api/managed-gateway/users/:userId/compliance`
- `GET /api/gateway/cursor/openai/deployments`
- `POST /api/gateway/cursor/openai/deployments/:deployment/chat/completions`

## Troubleshooting

### Employee cannot log in

Check:

- employee record exists
- temporary password was shared correctly
- `EMPLOYEE_AUTH_SECRET` is set consistently on the API

### Managed gateway key works but no usage shows up

Check:

- employee is using the CostPilot gateway base URL from the dashboard
- deployment name matches one of the supported deployments
- Postgres is healthy
- ClickHouse is optional for analytics but not for the main governed write

### Admin login works but org data does not load

Check:

- Clerk user is linked to a CostPilot user
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY`, and `CLERK_AUTHORIZED_PARTIES` are correct
- Postgres is reachable

### Automatic employee email is not being sent

Check:

- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

If SMTP is not configured, the admin UI should still show the generated temporary password for manual sharing.

## Final recommendation

If you are rolling this out now, use this message internally:

- Organization admins use CostPilot to create teams, employees, policies, and managed Cursor keys.
- Employees sign in to CostPilot first, copy the managed Cursor settings from the employee dashboard, and use that governed setup for supported chat workflows.
- MCP remains available as a helpful sidecar for visibility and manual imports, but not as the main guarantee that every Cursor request is governed.

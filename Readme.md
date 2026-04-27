# CostPilot

CostPilot is a full-stack AI governance platform with:

- an admin app for organizations
- an employee login flow with personal usage/cost visibility
- a colocated MCP stdio server for Cursor integrations
- a Fastify API for usage tracking, policy enforcement, billing, and auth

## Repo Layout

```text
apps/
  api/   Fastify API + colocated MCP stdio entrypoint
  web/   Next.js web app
packages/
  sdk/   SDK helpers
prisma/  Prisma schema
```

## Authentication Model

There are two login experiences:

1. Organization admin login
- uses Clerk
- manages organization settings, teams, users, policies, and billing

2. Employee login
- uses `email + password`
- shows the employee’s own usage, spend, and Cursor MCP configuration

When an admin adds a user, CostPilot generates a temporary password and can email the credentials automatically if SMTP is configured.

## Employee Credentials and MCP

Employees sign in with:

- work email
- password

The colocated MCP server also uses employee credentials, not a shared secret.

Set these in `apps/api/.env` when you want to use MCP locally:

```env
COSTPILOT_API_URL="http://127.0.0.1:4000"
COSTPILOT_EMPLOYEE_EMAIL=""
COSTPILOT_EMPLOYEE_PASSWORD=""
```

## Admin / API Environment

Important API env vars in `apps/api/.env`:

```env
AUTH_MODE="clerk"
DATABASE_URL="..."
DIRECT_URL="..."
CLERK_SECRET_KEY="..."
CLERK_PUBLISHABLE_KEY="..."
CLERK_JWT_KEY="..."
CLERK_AUTHORIZED_PARTIES="http://localhost:3000,http://localhost:4000"
EMPLOYEE_AUTH_SECRET="employee_auth_dev_secret"
EMAIL_FROM="alerts@example.com"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

## Local Development

Install dependencies:

```bash
pnpm install
pnpm prisma:generate
```

If you changed the Prisma schema, push it to your local/remote database:

```bash
pnpm prisma db push --schema prisma/schema.prisma
```

Start the API and colocated MCP process together:

```bash
pnpm dev:api
```

Start the web app:

```bash
pnpm dev:web
```

If you want only the MCP stdio process:

```bash
pnpm dev:api:mcp
```

## Readiness

`GET /ready` reports:

- API dependency readiness
- whether the MCP process has been triggered recently
- the MCP auth mode (`employee-credentials`)

## Employee Dashboard

After employee login, the dashboard shows:

- total requests
- total tokens
- total cost
- recent usage events
- a prebuilt Cursor MCP config snippet

The Cursor config snippet is ready to copy/paste. The employee only needs to replace the password placeholder with their own password.

## Cursor MCP Config

Typical local Cursor config:

```json
{
  "mcpServers": {
    "costpilot": {
      "command": "npx",
      "args": [
        "-y",
        "--package=github:Shubham-garg1234/CostPilot_MCP",
        "costpilot-mcp"
      ],
      "env": {
        "COSTPILOT_API_URL": "https://costpilot-lmzd.onrender.com",
        "COSTPILOT_EMPLOYEE_EMAIL": "your-email",
        "COSTPILOT_EMPLOYEE_PASSWORD": "your-password"
      }
    }
  }
}
```

## Email Delivery

When an admin adds a user, CostPilot:

- generates a temporary password
- stores a password hash
- tries to email the credentials automatically through Nodemailer

If SMTP is not configured, the UI shows the generated temporary password so the admin can share it manually.

## Main Routes

Web:

- `/` admin overview
- `/organization` admin organization management
- `/employee-login` employee credential login
- `/employee` employee usage and Cursor MCP setup

API:

- `POST /api/auth/employee-login`
- `GET /api/auth/employee-dashboard`
- `GET /api/auth/session`
- `GET /api/dashboard/summary`
- `POST /api/users`
- `POST /api/teams`
- `POST /api/organizations`

## Notes

- Clerk remains the admin/org control-plane login.
- Employee login is separate and is intended for internal organization users.
- MCP no longer depends on `COSTPILOT_MCP_SECRET`, `MCP_SERVICE_ORG_ID`, or `MCP_SERVICE_USER_ID`.

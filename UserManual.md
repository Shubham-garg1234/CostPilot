# CostPilot User Manual

## Who This Is For

This manual is for first-time organizations using CostPilot to govern AI usage, track spend, and manage policies across teams.

## What CostPilot Does

CostPilot gives your organization one place to:

- route AI requests through a governed proxy
- track usage from tools that cannot be fully proxied
- enforce role-based policies
- monitor costs by team, model, provider, feature, and source
- generate billing views for internal chargeback or customer invoicing

## Before You Start

Your organization should have these ready:

- a deployed CostPilot web app
- a deployed CostPilot API
- a Postgres database
- a Redis instance
- Clerk project keys
- Stripe keys if billing is enabled
- provider keys for OpenAI, Anthropic, and/or Gemini

## First-Time Setup For An Organization Admin

### Step 1: Sign in

- sign in with your organization-approved account
- if this is your first login, create or join your organization

### Step 2: Create your organization

Your first admin should define:

- organization name
- billing slug or workspace slug
- default monthly budget
- markup policy if you use chargebacks

Recommended approach:

- use a stable slug based on your company or business unit
- keep naming consistent with your finance and IT systems

### Step 3: Create teams

Create teams before adding users so reporting stays clean from day one.

Typical teams:

- Platform
- Support
- Growth
- Research
- Sales Engineering

### Step 4: Add users and roles

Assign each user to a role that matches their level of access.

Default role guidance:

- `ADMIN`: full access, settings, policies, billing, and organization management
- `MANAGER`: team and policy oversight, limited admin functions
- `SDE2`: advanced technical user with broader model access
- `SDE1`: standard technical user with moderate access
- `INTERN`: restricted access with conservative cost and model limits

### Step 5: Create policies

Policies are the heart of CostPilot. Start simple.

Each policy should define:

- role
- category
- optional feature
- allowed models
- request or token limits
- monthly cost ceiling
- violation action

Recommended first policies:

- block premium models for interns
- limit high-cost categories for broad roles
- warn before budget overages
- throttle repetitive abuse patterns

### Step 6: Connect integrations

CostPilot supports two main ingestion patterns.

#### Proxy mode

Use proxy mode when you control the AI request path.

Best for:

- internal apps
- support copilots
- AI workflows you own end-to-end

Why use it:

- strongest policy enforcement
- most accurate tracking
- consistent routing behavior

#### Usage-event mode

Use usage-event ingestion when the upstream tool already made the request.

Best for:

- third-party tools
- editor integrations
- observability-only pipelines

Why use it:

- unified reporting even when proxying is not possible

## Daily Operations

### Overview dashboard

Use the overview page to monitor:

- spend trend
- token volume
- top teams
- top providers
- recent policy violations
- system health

Check this page daily if you operate AI at scale.

### Policy management

Use the policies page to:

- create new role rules
- tighten or relax model access
- monitor which policies are most active
- adjust thresholds after rollout

Good practice:

- change one policy area at a time
- announce high-impact changes to affected teams
- review results after 24 to 72 hours

### Billing and cost reviews

Use billing views to:

- monitor monthly spend
- compare raw cost vs marked-up cost
- prepare internal chargeback reports
- identify unusually expensive teams or features

Recommended weekly review:

- top teams by spend
- top features by cost
- top providers by cost
- biggest policy violations
- unusual spikes by day or team

## How To Use CostPilot Safely

### Model governance

Do not give every role access to every model.

Start with:

- cheap models as defaults
- premium models only for approved users
- explicit feature-level restrictions for expensive workflows

### Budget control

Set:

- organization monthly budget
- team-level review thresholds
- role-based token or request caps

### Change management

Before changing a policy:

- confirm which teams are affected
- decide whether to warn, throttle, or block
- test in staging if the change is significant

## Recommended Operating Model

### For admins

- review alerts daily
- review budgets weekly
- review policies monthly
- review member roles quarterly

### For managers

- watch team usage
- check if the team is drifting toward premium models
- identify workflows that should be optimized

### For finance or operations

- reconcile monthly billing
- export usage summaries for chargebacks
- review markup and invoice logic

## Common Workflows

### Add a new team

1. Create the team.
2. Add users.
3. Apply the correct default policies.
4. Confirm dashboards show the team correctly.

### Add a new tool integration

1. Decide if the tool should use proxy mode or usage-event mode.
2. Assign a `source` and `integrationType`.
3. Test with a staging organization.
4. Verify usage appears in summaries and recent events.
5. Add or update policies for that source and workflow.

### Investigate a spend spike

1. Open the overview dashboard.
2. Check the date range and data freshness.
3. Identify the top team, feature, and provider.
4. Review recent violations and recent events.
5. Decide whether to optimize, warn, throttle, or block.

## Interpreting Key Concepts

### Provider

The upstream AI vendor, such as OpenAI, Anthropic, or Gemini.

### Source

Where the usage came from, such as SDK, Cursor, Codex, Claude, Copilot, MCP, or direct app usage.

### Category

The business workflow, such as chat, code generation, email generation, or research.

### Feature

The exact product surface or use case, such as assistant, autocomplete, review, or auto-reply.

## Troubleshooting

### I can sign in but I cannot access data

Possible causes:

- your user is not linked to the correct organization
- your role does not allow the action
- your org setup is incomplete

### Usage is not appearing

Check:

- the integration is sending the correct API base URL
- auth token is valid
- `source`, `category`, and `provider` are being sent
- the event has a unique `requestId`

### Requests are being blocked

Check:

- your role
- the applied policy
- model allowlist
- request, token, or cost thresholds
- temporary cooldown state

### Billing looks wrong

Check:

- raw usage totals
- model catalog pricing
- markup rules
- duplicate request IDs
- date range boundaries

## Best Practices For New Organizations

- start with conservative access
- prefer proxy mode wherever possible
- keep team structure clean from the beginning
- use stable names for orgs, teams, and sources
- review alerts before relaxing restrictions
- train admins and managers on policy effects

## Support Handoff Checklist

When handing CostPilot to another admin or team, make sure they know:

- how users are provisioned
- which integrations are live
- where billing numbers come from
- which policies are most important
- who owns incident response for provider outages

## Suggested Internal Rollout Plan

### Week 1

- onboard admins
- create teams
- add initial policies
- connect one low-risk integration

### Week 2

- expand to more teams
- monitor alerts and spend
- tune policies

### Week 3

- enable billing reviews
- add manager workflows
- standardize operating cadence

## Final Advice

CostPilot works best when you treat it as both a governance layer and an operational tool. Start with clear roles, conservative policies, and good data hygiene. Once your first teams are stable, expand model access and automation gradually.

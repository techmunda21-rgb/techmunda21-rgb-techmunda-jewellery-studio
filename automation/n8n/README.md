# n8n workflows

`pnpm`-free: `node build.mjs` regenerates `workflows/*.json`; `node validate.mjs` checks them. Import each file via *Workflows → Import from file*.

| File | Trigger | What it does |
|---|---|---|
| A-lead-capture | Webhook (HMAC `x-signature`) | validate signature → validate payload (explicit `consent: true`) → signed call to `/automation/lead-capture` (API creates contact+lead, records consent, queues AI qualification, notifies the assigned rep) |
| B-creative-job | Webhook | validate → `/automation/creative-jobs/:id/process` (the API's provider adapter generates variations; they land as `DRAFT` for human review) |
| C-followup-draft | Hourly | `/automation/followups/draft-due`: drafts for *consented*, due leads → `PENDING_REVIEW` + notification. **Never sends** |
| D-approved-send | Webhook | requires a human **confirmation token** (`POST /communications/drafts/:id/send-confirmation`) → `/automation/send-approved`. The API re-verifies approval version, role, consent, recipient, Gmail connection |
| E-daily-report | Daily 08:00 | `/automation/daily-report` → in-app notification to owners/managers |

**n8n environment** (container env, not stored in workflows): `API_BASE_URL`, `TENANT_ID`, `TENANT_WEBHOOK_SECRET`, `INBOUND_WEBHOOK_SECRET`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
Get a tenant's secret: `AUTOMATION_WEBHOOK_SECRET=… node infrastructure/scripts/tenant-webhook-secret.mjs <tenant-id>` (add `--call /automation/daily-report` to test a signed request against a running API — verified working).

Properties: tenant-scoped secret (cannot act on other tenants); 5-minute replay window; retries (3×, 2 s) on HTTP nodes; failures routed to an error branch (and recorded server-side in `automation_runs`); idempotent via `correlationId`; no credentials in logs.
**Status:** JSON validated structurally and the signing scheme verified against the live API; the workflows were **not executed inside an n8n instance** (none available). Inbound webhook signatures (A, B, D) are checked in-workflow with `INBOUND_WEBHOOK_SECRET` over the raw body.

# API reference

Base URL `/api/v1`. Interactive OpenAPI: `GET /api/docs` (JSON: `/api/docs-json`). Auth: `Authorization: Bearer <accessToken>` except where noted.

**Conventions** — errors: `{ "error": { "code", "message", "details?", "requestId" } }`; lists: `?page=&pageSize=&q=` → `{ data, meta: { page, pageSize, total, totalPages } }`; ids are UUIDs; other tenants' ids return `404`.

Send is idempotent: body `{ idempotencyKey, version }`; a repeat with the same key returns the original result with `duplicate: true`; a different key after SENT returns `409 ALREADY_SENT`.

Machine endpoints under `/automation/*` (n8n) are intentionally omitted from OpenAPI; see [SECURITY.md](SECURITY.md) and `automation/n8n/README.md`.

## AI

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/ai/status` | Which AI features run live and which are clearly-labelled simulations | Bearer |

## Analytics

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/analytics/campaigns` | Campaign and content production analytics | Bearer |
| GET | `/api/v1/analytics/leads` | Lead analytics | Bearer |
| GET | `/api/v1/analytics/overview` | Daily sales dashboard KPIs, revenue trend and funnel | Bearer |

## Approvals

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/approvals` | Approval queue (default: pending) | Bearer |
| GET | `/api/v1/approvals/ready-to-send` | Approved drafts awaiting the explicit Send confirmation | Bearer |

## Audit

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/audit` | List audit log entries for the tenant | Bearer |

## Auth

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Sign in with email and password | Bearer |
| POST | `/api/v1/auth/logout` | Revoke the refresh-token family | Bearer |
| GET | `/api/v1/auth/me` | Current user and tenant | Bearer |
| POST | `/api/v1/auth/refresh` | Rotate the refresh token and obtain a new access token | Bearer |

## CRM

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/activities` | CRM activity feed / timeline | Bearer |
| GET | `/api/v1/opportunities` | List opportunities | Bearer |
| POST | `/api/v1/opportunities` | Create an opportunity for a lead | Bearer |
| PATCH | `/api/v1/opportunities/{id}` | Update opportunity value, stage or close date | Bearer |

## Campaigns

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/campaigns` | List campaigns | Bearer |
| POST | `/api/v1/campaigns` | Create a campaign (starts as DRAFT) | Bearer |
| PATCH | `/api/v1/campaigns/{id}` | Update a campaign, attach approved assets, or change status | Bearer |

## Communications

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/communications/drafts` | List drafts | Bearer |
| POST | `/api/v1/communications/drafts` | Create an email draft (AI-written or manual). Saved as PENDING_REVIEW — never sent. | Bearer |
| GET | `/api/v1/communications/drafts/{id}` | Get a draft | Bearer |
| PATCH | `/api/v1/communications/drafts/{id}` | Edit a draft — invalidates any previous approval | Bearer |
| POST | `/api/v1/communications/drafts/{id}/approve` | Approve the current version and create/update the Gmail draft. Does NOT send. | Bearer |
| POST | `/api/v1/communications/drafts/{id}/reject` | Reject a draft | Bearer |
| POST | `/api/v1/communications/drafts/{id}/request-approval` | Submit an edited/rejected draft for approval | Bearer |
| POST | `/api/v1/communications/drafts/{id}/send` | Deliberately send an approved draft through Gmail (idempotent) | Bearer |
| POST | `/api/v1/communications/drafts/{id}/send-confirmation` | Issue a short-lived send confirmation (for the n8n approved-send workflow) | Bearer |

## Creative Studio

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/creatives/assets` | Generated assets (filter by review status) | Bearer |
| POST | `/api/v1/creatives/assets/{id}/approve` | Approve an asset (requires accuracy checklist confirmation) | Bearer |
| GET | `/api/v1/creatives/assets/{id}/export` | Signed download URL — approved assets only | Bearer |
| POST | `/api/v1/creatives/assets/{id}/reject` | Reject an asset | Bearer |
| POST | `/api/v1/creatives/assets/{id}/submit-review` | Submit an asset for human approval | Bearer |
| GET | `/api/v1/creatives/jobs` | Recent creative jobs | Bearer |
| POST | `/api/v1/creatives/jobs` | Create a creative job from an authorised original image | Bearer |
| GET | `/api/v1/creatives/jobs/{id}` | Creative job status with generated assets and provenance | Bearer |

## Integrations

| Method | Path | Purpose | Auth |
|---|---|---|---|
| DELETE | `/api/v1/integrations/google` | Disconnect the Google account and revoke the token | Bearer |
| GET | `/api/v1/integrations/google/callback` | Google OAuth redirect target | Bearer |
| GET | `/api/v1/integrations/google/connect` | Begin Google OAuth (returns the consent URL) | Bearer |
| GET | `/api/v1/integrations/status` | Integration and AI mode status (live vs simulated) | Bearer |

## Leads

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/contacts/{id}/consent/withdraw` | Record that a contact withdrew consent (blocks all outreach) | Bearer |
| GET | `/api/v1/leads` | List leads with search and filters | Bearer |
| GET | `/api/v1/leads/board` | Kanban board: leads grouped by pipeline stage | Bearer |
| POST | `/api/v1/leads/import/commit` | Insert reviewed CSV rows (no marketing consent is assumed) | Bearer |
| POST | `/api/v1/leads/import/preview` | Preview a CSV import with duplicate detection (nothing is inserted) | Bearer |
| GET | `/api/v1/leads/{id}` | Lead detail with timeline, notes, tasks and drafts | Bearer |
| PATCH | `/api/v1/leads/{id}` | Update stage, assignment or follow-up | Bearer |
| POST | `/api/v1/leads/{id}/notes` | Add a note | Bearer |
| POST | `/api/v1/leads/{id}/qualify` | Queue AI qualification for a lead | Bearer |
| POST | `/api/v1/leads/{id}/suggest-reply` | AI-generated internal reply suggestions (never sent) | Bearer |
| POST | `/api/v1/leads/{id}/tasks` | Add a task / follow-up reminder | Bearer |
| GET | `/api/v1/tasks` | Open tasks and follow-up reminders | Bearer |
| PATCH | `/api/v1/tasks/{id}` | Complete or reschedule a task | Bearer |

## Media

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/media/confirm` | Validate and register an uploaded file | Bearer |
| GET | `/api/v1/media/file/{token}` |  | public/signed |
| POST | `/api/v1/media/upload-url` | Request a signed upload URL (requires confirmation that the image is client-authorised) | Bearer |
| PUT | `/api/v1/media/upload/{token}` |  | public/signed |
| GET | `/api/v1/media/{id}` | Get media metadata and a short-lived view URL | Bearer |

## Products

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/products` | List products (tenant-scoped, paginated) | Bearer |
| POST | `/api/v1/products` | Create a product | Bearer |
| DELETE | `/api/v1/products/{id}` | Delete a product and its media | Bearer |
| GET | `/api/v1/products/{id}` | Get a product with its media | Bearer |
| PATCH | `/api/v1/products/{id}` | Update a product | Bearer |

## Public

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/public/leads` | Submit a customer enquiry (public) | Bearer |
| GET | `/api/v1/public/tenants/{slug}` | Public business name for the enquiry page (no private data) | Bearer |

## Users

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/notifications` | My in-app notifications | Bearer |
| GET | `/api/v1/tenants/current` | Current tenant profile | Bearer |
| GET | `/api/v1/users` | Team members in the tenant (for assignment) | Bearer |

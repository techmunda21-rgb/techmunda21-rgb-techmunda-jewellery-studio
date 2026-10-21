# Techmunda · AI Jewellery Growth Studio

A multi-tenant, human-in-the-loop platform for jewellery retailers (India & Dubai): product catalogue, styled marketing visuals, public lead capture, AI lead qualification, a Kanban CRM, and **approve-then-send** Gmail follow-ups.

> **This is a working 3-day demonstration, not a claim of production readiness.** Anything that is simulated says so in the UI (`DEMO SIMULATION` badges) and in [docs/DEMO.md](docs/DEMO.md#live-vs-simulated).

| Area | Status without any credentials | With credentials |
|---|---|---|
| Auth, tenants, RBAC, catalogue, uploads, CRM, approvals, audit | **Real** | — |
| Lead qualification | Rule-based engine, labelled `SIMULATED_RULES` | OpenAI LLM + strict Zod validation (`OPENAI_API_KEY`) |
| Creative Studio | Demo adapter (original photo composited on a styled backdrop, watermark-labelled — **not AI**) | OpenAI image edit (`OPENAI_API_KEY`) — *not exercised in the sandbox* |
| Gmail drafts/send | **Blocked** (honest blocked state in UI/API) | Google OAuth (`GOOGLE_CLIENT_ID/SECRET`) — *not exercised against real Gmail* |
| n8n workflows | Importable JSON, validated structurally; webhook signing verified against the live API | Run in your n8n |

## Stack
Next.js 15 (App Router, React 19, Tailwind, TanStack Query, React Hook Form + Zod, Recharts; Framer Motion is installed but not yet used) · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis + BullMQ · S3-compatible storage (local-disk driver for dev, MinIO/S3 for compose) · OpenAI SDK · googleapis · n8n. UI primitives are ShadCN-style (Radix + CVA) written in-repo.

## Quick start (no Docker)
Requires Node ≥ 20, pnpm 10, PostgreSQL 16, Redis.
```bash
pnpm install
cp .env.example .env            # then fill the 5 secrets (see comments); generate with: openssl rand -base64 48
createdb jewellery_studio       # or: psql -c "CREATE DATABASE jewellery_studio"
pnpm build:packages             # shared → database(prisma generate) → core
pnpm db:migrate                 # prisma migrate deploy
pnpm db:seed                    # repeatable synthetic demo data
# terminals (dev):
pnpm dev:api    # http://localhost:4000  (Swagger: /api/docs)
pnpm dev:worker # BullMQ workers (qualification, creative jobs)
pnpm dev:web    # http://localhost:3000
```
Production-style local run: `pnpm build && infrastructure/scripts/run-local.sh start` (and `... stop`). Build the web app with `NODE_ENV` unset/`production`.

### Docker
`docker compose up --build` (a `render.yaml` blueprint is also included — untested) (Postgres, Redis, MinIO, migrate, api, worker, web). `docker compose --profile automation up n8n` adds n8n. *The compose/Dockerfile were written but could not be built in the authoring sandbox (no Docker daemon).*

### Demo logins (password `Demo@12345`)
| Email | Role |
|---|---|
| owner@suvarna.demo | Tenant owner (Aarav Sharma) |
| manager@ / designer@ / sales@ / sales2@ / viewer@suvarna.demo | Manager / Designer / Sales / Sales / Viewer |
| owner@alnoor.demo | Second tenant (isolation demo) |
| admin@techmunda.demo | Platform admin |

Public enquiry page: `http://localhost:3000/enquiry/suvarna-heritage`

## Environment variables
See [.env.example](.env.example) (every variable documented). Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (base64 32 bytes), `URL_SIGNING_SECRET`, `AUTOMATION_WEBHOOK_SECRET`. The API refuses to boot with missing/short secrets.

## Tests
```bash
pnpm test                 # core unit (vitest, 23) + API integration (jest/supertest, 46; needs Postgres, DB jewellery_studio_test is auto-migrated)
pnpm typecheck
node automation/n8n/validate.mjs
# browser E2E against a running stack (needs seeded DB, API, worker, web):
pnpm --filter @techmunda/web exec playwright test            # SHOTS_DIR=/some/dir saves screenshots of every screen @ desktop/tablet/mobile
```
Details: [docs/TESTING.md](docs/TESTING.md).

## Design system
Royal red `#780514` (actions) · antique gold `#B88A36` (icons/borders) · warm cream `#F8EEDB` (app bg) · ivory `#FFF9EF` (panels) · deep maroon `#461318` (sidebar) · text `#351B1D`. All colours are CSS variables in `apps/web/styles/globals.css`, exposed as Tailwind tokens — components contain no hex values. Fonts: Playfair Display (headings), Cormorant Garamond (hero/editorial), Inter (UI/data), bundled via `@fontsource` (no network at runtime). Workflow states (draft / pending / approved / sent / rejected) each have a distinct colour **and** icon **and** label.

## Troubleshooting
| Symptom | Fix |
|---|---|
| API exits: `Invalid environment configuration` | Fill the secrets in `.env` (≥32 chars; `ENCRYPTION_KEY` base64-32B). |
| `P1001 can't reach database` | Start Postgres; check `DATABASE_URL`; run `pnpm db:migrate`. |
| Qualification/creative jobs stay queued | Start the worker (`pnpm dev:worker`) and Redis, or set `QUEUE_MODE=inline`. |
| `next build` fails with `<Html> should not be imported…` | `NODE_ENV` is set to `development` in your shell — unset it for builds. |
| Images don't load | `API_PUBLIC_URL` must be reachable from the browser (signed media URLs use it). |
| Login 429 | Login is limited to 10/min/IP. |
| "Sending is blocked: Gmail is not connected" | Expected until Google OAuth is configured — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#gmail-oauth). |

## Email design
Approved plain text is rendered into a branded, responsive HTML email (maroon/gold header, serif greeting and signature, opt-out footer) and sent as `multipart/alternative`. Content is HTML-escaped, no links or tracking pixels are added, and the Approvals screen shows the exact preview. Source: `packages/shared/src/email.ts`.

## Imagery
Seed product, CRM and hero photos are crops of the reference image supplied by the project owner (`packages/database/seed-assets`, ~240 px originals upscaled). Treat them as placeholders and replace them with client-authorised photography.

## Layout
`apps/web` (Next.js) · `apps/api` (NestJS) · `apps/worker` (BullMQ) · `packages/shared` (Zod, constants) · `packages/database` (Prisma schema, migrations, seed) · `packages/core` (env, crypto, storage, AI providers, processors) · `automation/n8n` · `infrastructure/` · `docs/`.

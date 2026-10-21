# Architecture

```
Browser (Next.js) ──REST/JSON, Bearer JWT──▶ NestJS API ──▶ PostgreSQL (Prisma)
        │                                     │   │──▶ Redis/BullMQ ──▶ Worker (qualification, creative jobs)
        │ signed URLs (images)                │   │──▶ Storage (local disk | S3/MinIO)
        └──────────────────────────────◀──────┘   │──▶ OpenAI (text, image)  [optional]
 n8n ──HMAC-signed webhooks──▶ /automation/*      └──▶ Gmail API (OAuth)     [optional]
```

* **Monorepo (pnpm).** `packages/core` holds everything both the API and the worker need (env validation, AES-GCM, signed tokens, storage drivers, AI providers, the two job processors). The API enqueues; the worker runs the *same* processor functions (`QUEUE_MODE=inline` runs them in-process for tests).
* **Tenancy.** Every tenant-owned table has `tenant_id`; the tenant comes only from the verified JWT + a DB re-check on each request. Services always query `where: { id, tenantId }` and return 404 (not 403) for other tenants' ids. Integration tests assert this across products, media, leads, drafts, assets and automation secrets.
* **Provider abstraction.** `TextLLM` (OpenAI impl; null ⇒ simulation) and `ImageProvider { generate, edit, getStatus }` (OpenAI + `DemoImageProvider`). `AI_MODE=openai` without a key throws `NOT_CONFIGURED` (HTTP 503) instead of silently simulating. Gmail sits behind `GmailGateway` (real Google impl; fake in tests).
* **AI output is never trusted.** LLM JSON is validated by Zod (one repair retry, then `INVALID_OUTPUT`); the lead score is recomputed deterministically; budgets not traceable to customer text are nulled; drafts containing money figures absent from context are refused; customer text is delimited and the prompts say it is data.
* **Approval state machines.** Assets: `DRAFT → PENDING_REVIEW → APPROVED|REJECTED`. Drafts: `PENDING_REVIEW → APPROVED → SENDING → SENT|SEND_FAILED`; any content edit bumps `version`, clears `approved_version` and returns to `DRAFT`. Send claims the row with a conditional `UPDATE … WHERE status IN (APPROVED,SEND_FAILED) AND approved_version = version` so concurrent/duplicate sends cannot both proceed; the idempotency key is unique.
* **No background sender.** No queue/processor/cron can send email. The only paths to Gmail send are the authenticated `POST /communications/drafts/:id/send` and the n8n send endpoint, which additionally requires a short-lived human confirmation token bound to draft id + version + user.
* **Media.** Signed upload URL → bytes → `confirm` validates magic bytes (via libvips decode), MIME match, size, dimensions, then stores checksum. Originals require an explicit "client-authorised" confirmation. Generated assets keep provenance (job → source media → prompt/brief → provider/simulated flag).

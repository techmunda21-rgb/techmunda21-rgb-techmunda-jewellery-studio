# Testing

| Suite | Command | What it proves |
|---|---|---|
| Core unit (vitest, 23) | `pnpm --filter @techmunda/core test` | qualification schema + mocked-LLM paths, deterministic scoring weights, budget parsing, no invented budgets/prices, AES-GCM & signed tokens, env fail-fast, missing-AI-key handling, demo adapter output |
| API integration (jest + supertest, 68 incl. signup/showcase/catalogue) | `pnpm --filter @techmunda/api test` | real Nest app + real Postgres (`jewellery_studio_test`, auto-migrated), inline queue, fake Gmail gateway |
| Browser E2E (Playwright) | `pnpm --filter @techmunda/web exec playwright test` | every screen at 1440/820/390 px: no horizontal overflow, no console errors; full flow enquiry → worker qualification → CRM → draft → approve → send blocked → edit voids approval → timeline |
| n8n | `node automation/n8n/validate.mjs` | JSON validity, connection integrity, code-node syntax, no inlined secrets |

## Mandatory-case map
| Required case | Test |
|---|---|
| Login success/failure | `auth-tenancy` – login succeeds / identical failure for wrong password vs unknown user |
| Unauthorized rejected | `auth-tenancy` – 401 w/o or with bad token; disabled user; role 403s; viewer read-only |
| Tenant A ≠ Tenant B | `auth-tenancy` – products, media, leads, drafts, writes, creates-by-reference, lists, spoofed `tenantId`, webhook secrets |
| Invalid image / oversized | `media-creative` – text-as-PNG, MIME mismatch, GIF, >10 MB declared, oversized body (413), missing rights, tampered token |
| Creative job failure | `media-creative` – missing source object ⇒ job `FAILED` with message |
| Missing AI credentials | `media-creative` (503 `AI_NOT_CONFIGURED`, no job) + core unit |
| AI output schema validation | core unit (invalid enum/range rejected; invented figures refused; provider errors propagate) |
| Lead validation / duplicates | `leads-crm` – field rules, consent, honeypot/timing, repeat enquiry merge, CSV duplicate detection, rate limit (429) |
| Missing consent blocks outreach | `communications` – NOT_GRANTED/WITHDRAWN cannot be drafted; n8n follow-up skips non-consented; withdrawal cancels drafts |
| No send without approval / edit voids approval / no duplicate send | `communications` – NOT_APPROVED, APPROVAL_STALE, same-key replay, different key ⇒ 409, two concurrent sends ⇒ exactly one |
| Revoked OAuth | `communications` – `INTEGRATION_REVOKED`, connection marked, draft `SEND_FAILED`, further sends blocked; Gmail-not-connected state |
| CRM activities | `leads-crm` / `communications` – created, qualified, stage, note, task, approved, sent recorded |

Catalogue additions (`catalogue.spec`, `e2e/catalogue.spec.ts`): purity canonicalisation + fineness + pure-metal grams (nothing invented without a weight), rejection of impossible purities/weights, CSV preview/commit/update rules, role and tenant scoping, ordered 360° frames excluded from thumbnails; browser: generated CSV imports cleanly, 12 frames upload, viewer rotates by keyboard and auto-play.

Signup (`signup.spec`, `e2e/signup.spec.ts`): channel availability + honest 503, consent/strong-password/phone-format gates, nothing created before verification, OTP stored only as HMAC and never returned, e-mail and SMS verification flags, lock after 5 wrong codes, expiry, resend cooldown/invalidation, existing-account/honeypot/rate-limit, delivery failure stores nothing, export/self-delete with password, non-demo workspaces cannot self-delete, retention purge, console-OTP refused in production/Render. Browser: full signup → OTP → workspace → export → delete → login refused.

## Not covered / honest limits
Real SMTP/Twilio delivery (tests use an in-memory fake; the e2e reads the dev console OTP), real Gmail, real OpenAI, real S3/MinIO, Docker images and a live n8n instance were **not** exercised (no credentials/daemons in the sandbox). The real `GoogleGmailGateway` and `OpenAiImageProvider/TextLLM` are therefore compile-checked but unverified against the providers. Browser E2E is chromium-only. No load, accessibility-audit (axe) or security-scan tooling was run; accessibility work was by construction (labels, roles, focus rings, keyboard alternatives to drag-and-drop, state shown by text+icon).

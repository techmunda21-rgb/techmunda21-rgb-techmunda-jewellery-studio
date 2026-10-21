# Deployment

## Runtime requirements
Postgres 16, Redis 7, S3-compatible bucket (or a persistent volume for `STORAGE_DRIVER=local` — single instance only), Node 22. Run `prisma migrate deploy` before each release. Processes: `api` (stateless, but see OAuth-state note), `worker` (scale by concurrency), `web`.

## Steps (any container host)
1. Provision Postgres/Redis/bucket; create the app DB user with least privilege.
2. Generate secrets (`openssl rand -base64 48` ×4 and `openssl rand -base64 32` for `ENCRYPTION_KEY`) — store in the platform's secret manager; **rotating `ENCRYPTION_KEY` requires re-encrypting `integration_connections`**.
3. Build: `docker build -f infrastructure/docker/Dockerfile --target api|worker|web|migrate .` (`NEXT_PUBLIC_API_URL` is baked into the web build).
4. Run `migrate`, then `api`, `worker`, `web` behind TLS. Set `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGINS` to the real https origins. Put the API behind a proxy that sets `X-Forwarded-For` (the app trusts one proxy hop).
5. Seed only demo environments (`pnpm db:seed`). Create real tenants/users via SQL or an admin script (no self-service sign-up exists).

## Gmail OAuth
1. Google Cloud Console → new project → enable **Gmail API** → OAuth consent screen (External; add `techmunda21@gmail.com` as a *test user* while in Testing mode).
2. Credentials → OAuth client ID (Web) → redirect URI exactly `${API_PUBLIC_URL}/api/v1/integrations/google/callback`.
3. Set `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (+ `GMAIL_DESIRED_SENDER`), restart the API.
4. Sign in as the tenant owner → Settings → **Connect Google account** → choose `techmunda21@gmail.com` and grant access. Settings shows the connected account and warns if it differs from the intended sender.
5. For non-test users Google requires app verification for the restricted `gmail.compose` scope (security assessment) — plan for this before a client rollout.
Until this is done the UI/API report *Gmail is not connected* and refuse to send. **This path has not been executed against real Google in the authoring environment.**

## Signup OTP delivery (e-mail and/or mobile)
Self-service signup (`/signup`) refuses to run unless a real delivery channel is configured.
**E-mail via Gmail SMTP (≈5 min, you must do this):**
1. Sign in to the Google account that will send the codes (e.g. `techmunda21@gmail.com`) → Security → turn on **2-Step Verification**.
2. Security → **App passwords** → create one named "Techmunda" → copy the 16-character password.
3. On Render → *techmunda-api* → Environment set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=techmunda21@gmail.com`, `SMTP_PASS=<app password>`, `SMTP_FROM=Techmunda <techmunda21@gmail.com>` → save (redeploys).
(Gmail caps ~500 messages/day for normal accounts; use a transactional provider such as SES/Resend/Brevo SMTP for volume — same variables.)
**Mobile SMS via Twilio:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`. For Indian numbers you need a DLT-registered sender ID/template (TRAI rule), which Twilio/MSG91 onboarding walks you through; test numbers on a trial account must be verified in Twilio first.
Never set `ALLOW_INSECURE_OTP_CONSOLE` on a hosted server (it is refused on Render/production anyway).
**Retention:** the API deletes expired demo workspaces (default 30 days, `DEMO_RETENTION_DAYS`) every 6 hours and at start-up; unfinished signups after 7 days.
**Legal text:** `/legal/terms` and `/legal/privacy` describe what the software does today. They are drafts written by the developer, **not legal advice** — have a lawyer review them (add governing law/jurisdiction, entity details, DPO/grievance officer if required under DPDP) before using signup with real clients, and bump `POLICY_VERSION` in `packages/shared/src/constants` whenever the text changes (users are then asked to accept again).

## OpenAI
Set `OPENAI_API_KEY` (and optionally models). Text features switch from `SIMULATED_RULES` to the LLM; the Creative Studio switches from the demo adapter to `images.edit`. Image model/size parameters follow `gpt-image-1`; verify against your account's available models. **Not executed against the live API here.**

## n8n
See `automation/n8n/README.md` (env vars, per-tenant secret, import order).

## Production hardening backlog
* Move web tokens to httpOnly cookies via a BFF; add CSRF.
* Redis-backed OAuth state + a distributed rate limiter (the throttler is in-memory per instance).
* Antivirus scanning (ClamAV) behind `MediaScanner`; strip EXIF on stored originals; CDN for media.
* Recover/alert on drafts stuck in `SENDING` (process crash between Gmail send and DB write ⇒ human must check the Gmail Sent folder; the app never auto-retries an ambiguous send).
* MFA / SSO, password reset & invite flows, account lockout, tenant provisioning UI.
* Per-tenant quotas and cost controls for AI calls; request-level observability (OpenTelemetry), error tracking, uptime alerts.
* Gmail `watch`/reply sync (inbound replies and bounces are not ingested); WhatsApp/SMS channels (not built).
* Consent management UX (preferences page, one-click unsubscribe endpoint); data-retention & deletion workflows (DPDP/GDPR requests); legal review of messaging rules per country.
* Image provenance/C2PA, watermarking policy, and a stricter pixel-level comparison for accuracy flags (currently a human checklist).
* Load/pen testing, dependency scanning, backups with restore drills, IaC.

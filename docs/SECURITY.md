# Security

| Control | Implementation |
|---|---|
| Passwords | bcrypt (cost 12); equal-time login for unknown users; one generic error |
| Tokens | 15-min JWT access + 7-day opaque refresh (SHA-256 hashed in DB), **rotation with reuse detection** (reusing a rotated token revokes the family); logout revokes family; disabled users/tenants are rejected on every request |
| RBAC | Global `JwtAuthGuard` + `RolesGuard`; `@Roles()` allow-lists; `VIEWER` is read-only for every non-GET. Approve email: owner/manager/platform admin. Send: + sales executive. Asset approval: + designer |
| Tenant isolation | tenant from token only; all queries tenant-scoped; per-tenant webhook secrets |
| Validation | Zod on every body/query (shared with the web forms); standard error envelope; no stack traces |
| Rate limiting | Global 240/min/IP; login 10/min; refresh 30/min; public enquiry 5/min |
| Bot/abuse | Honeypot field, <1.5 s timing trap, optional Cloudflare Turnstile (fails closed), duplicate-enquiry merge, no data echoed back, no tenant-existence probing beyond slug |
| CSRF | Bearer-token API (no ambient cookies) ⇒ not applicable. If you move tokens to httpOnly cookies you must add CSRF tokens/SameSite |
| Token storage (web) | Access/refresh tokens are kept in `localStorage` (demo trade-off: XSS exposure). Production recommendation: BFF with httpOnly+SameSite cookies |
| OAuth | Scope `gmail.compose` (+openid email) only; signed, 10-min, single-use `state` bound to tenant+user (in-process nonce store — use Redis if >1 API instance); only owners can connect; refresh tokens AES-256-GCM encrypted (`ENCRYPTION_KEY`), revoked on disconnect; revocation/expiry detected and surfaced |
| Uploads | Signed 15-min URLs, 10 MB cap enforced twice, type allow-list, magic-byte + decode check, MIME-match, rights confirmation, `nosniff`+`CSP sandbox` on served files. **No antivirus engine** is bundled: `MediaScanner` is the hook for ClamAV |
| Webhooks | HMAC-SHA256 over `timestamp.rawBody`, 5-min replay window, constant-time compare, **per-tenant derived secret** (`HMAC(master, "tenant:<id>")`), idempotent via `automation_runs(tenant, workflow, correlationId)` |
| Prompt injection | Customer text is untrusted data in delimited blocks; models have no tools; score recomputed server-side; outputs schema-checked; sending cannot be triggered by model output |
| Data minimisation | Name/email/phone are never sent to the LLM |
| Secrets & logs | Env-only secrets; pino redaction of auth headers/tokens/bodies; provider error text scrubbed; signed-URL tokens masked in request logs; activity metadata never contains email bodies |
| Audit | `audit_logs` for login, approvals, sends, exports, uploads, integration changes; `activity_logs` for the CRM timeline |
| Messaging rules | Consent `GRANTED` required to draft *and re-checked at send*; withdrawal cancels open drafts and blocks sends; opt-out line is appended to AI drafts; imported contacts have no consent; 200/day/tenant send cap; recipient must still equal the contact's email |

See [SECURITY-STRATEGY.md](SECURITY-STRATEGY.md) for the DevTools/code-exposure explanation, alerting and your owner checklist.

## Self-service signup & privacy controls
| Control | Implementation |
|---|---|
| Identity proof | One-time code to e-mail (SMTP) or SMS (Twilio); 6 digits from `crypto.randomInt`; 10-min expiry; stored only as HMAC(server secret, requestId+code); constant-time compare; 5 attempts then lock; 60-s resend cooldown, max 3 resends; nothing is created until verified; code never returned or logged (dev-only console mode is refused in production/Render) |
| Abuse | 5 signup starts/h per hashed IP, 3/h per e-mail, route throttles, honeypot, strong-password rule (10+ chars, letter+digit), bcrypt cost 12; password hash cleared from the request row after verification |
| Honesty | If no delivery channel is configured the API answers 503 `SIGNUP_UNAVAILABLE` and the UI says so — no fake or bypass code path |
| Consent | Explicit unticked Terms + Privacy boxes (server rejects otherwise), optional separate marketing box (default off); each acceptance stored with policy version, time and hashed IP (`policy_acceptances`) |
| Data minimisation | IPs stored only as keyed hashes; passwords as hashes; no card/ID/health data requested |
| Retention | Demo tenants get `demo_expires_at` (30 d); `RetentionService` purges expired tenants + files and stale signup requests every 6 h |
| User rights | Owner can download all workspace data as JSON and delete a demo workspace (password + typed confirmation); policy page documents the rest |
| Known trade-offs | Signup reveals whether an e-mail/mobile is already registered (409) to give honest feedback — mitigated by rate limits and OTP; phone numbers are stored in clear text (needed for lookup); backups on the host may outlive deletion for the provider's retention period |

**Known gaps / production hardening:** see [DEPLOYMENT.md](DEPLOYMENT.md#production-hardening-backlog).

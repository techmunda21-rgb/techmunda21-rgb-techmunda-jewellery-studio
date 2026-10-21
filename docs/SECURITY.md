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

**Known gaps / production hardening:** see [DEPLOYMENT.md](DEPLOYMENT.md#production-hardening-backlog).

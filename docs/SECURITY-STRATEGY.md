# Protecting the server and code — the realistic strategy

## 1. What Ctrl+Shift+I (DevTools) actually shows — and why it cannot be "hidden"
A browser must download the website's HTML/CSS/JavaScript to display it, so **anyone can always see the front-end files** in DevTools. That is true for every website in the world (banks included); there is no setting that stops it, and tools that "detect DevTools" are trivially bypassed (and flag your own customers and clients as "hackers"). What matters is **what is in those files**:

| Visible in DevTools (by design) | Never sent to the browser |
|---|---|
| Minified front-end bundles (no source maps are published — verified by an automated test), page text, API URLs | Server/API code, database, `.env`, JWT/encryption/SMTP/OpenAI/Google secrets, other tenants' data |

So the strategy is: **keep every secret server-side, make the API safe even if an attacker reads the front-end completely, detect real attacks, and alert you.**

## 2. Layers implemented
1. **Secrets only on the server** — environment variables (Render), never in code or git (audited: no secrets tracked).
2. **Authorisation on the server for every request** — JWT + role checks + tenant isolation (46+ tests prove other tenants' data cannot be read even by a logged-in user who knows the IDs).
3. **No source maps, strict CSP, security headers** — only our scripts may run (blocks injected scripts), clickjacking blocked (`frame-ancestors 'none'`), HSTS, nosniff, COOP. DevTools console shows a "Stop! Don't paste anything" self-XSS warning to protect users from social-engineering.
4. **Abuse controls** — login 10/min/IP, global rate limits, OTP attempt limits, bot honeypots, signup limits.
5. **Detection + alert e-mail ("the hidden hook")** — the server records and e-mails `ALERT_EMAIL` (techmunda21@gmail.com) when it sees: ≥5 failed logins from one IP in 10 min, a **replayed refresh token (session theft)**, floods of forged/tampered tokens, bad webhook signatures, scanner-like bursts of 401/403/404/429, OTP guessing, signup bombing. Alerts show IP, counts and advice — never passwords, tokens or OTPs. Events are stored (IPs hashed) and visible to the platform admin in *Settings → Email & OTP readiness / Security events*.
6. **Auto-block** — an IP that reaches 15 failed logins/10 min, a scanner burst of 150 denied requests/min, etc. is blocked for 1 hour (in memory per instance; use a firewall/CDN for permanent blocks).
7. **Tamper evidence** — audit log of logins, approvals, sends, exports, deletions.

## 2b. Limits you should know
* Brute force against **one account from many IPs** is slowed by rate limits but not auto-blocked per account.
* Alerts need SMTP to be configured; otherwise they are only written to the Render log.
* Auto-blocks are per server instance and reset on restart.

## 3. Things only YOU can do (highest impact first)
1. **Make the GitHub repository private** (it is currently *public*, so your whole code base is readable by anyone, regardless of any web-server hardening): GitHub → repo → Settings → General → Danger Zone → *Change visibility → Private*.
2. **Set a private `DEMO_PASSWORD`** in Render (the default `Demo@12345` is written in the repo docs). Do this before sharing the URL.
3. **Turn on 2-factor authentication** on GitHub, Render and the Gmail account `techmunda21@gmail.com` (use an authenticator app or passkey). An attacker who takes over those accounts bypasses everything else.
4. In Render: restrict who is invited to the workspace, make the **database access-list empty (internal connections only)**, keep *Shell* access to yourself, and rotate secrets (`JWT_*`, `ENCRYPTION_KEY`, `URL_SIGNING_SECRET`, `AUTOMATION_WEBHOOK_SECRET`) if you ever suspect exposure (all users are signed out).
5. In GitHub: enable branch protection on `main`, Dependabot alerts and secret scanning.
6. Set the SMTP app password (below) so alerts and OTP e-mails actually go out; use **Settings → Email & OTP readiness → Send test security alert** to confirm you receive them.

## 4. If an alert arrives
Read the alert's *Action* line (blocked or not). For repeated failed logins from an unknown IP: nothing else needed if it was blocked; rotate `DEMO_PASSWORD` if it persists. For **REFRESH_TOKEN_REUSE**: the session family was already revoked — contact that user and ask them to change their password. For **WEBHOOK_AUTH_FAILED / FORGED_TOKEN** bursts: rotate the matching secret in Render. Review *Settings → Security events* and the audit log.

## 5. E-mail / OTP setup on Render (5 minutes)
`render.yaml` already contains `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_FROM` and `ALERT_EMAIL` for techmunda21@gmail.com. Only the secret is missing:
1. Google account techmunda21@gmail.com → Security → 2-Step Verification **On** → **App passwords** → create "Techmunda" → copy the 16 characters.
2. Render → *techmunda-api* → Environment → set `SMTP_PASS` = that value → Save (it redeploys). *(If the blueprint was created before this change, use Blueprints → Sync so the new variables appear.)*
3. Sign in as `admin@techmunda.demo` → Settings → *Email & OTP readiness* → all rows should be green → **Send test e-mail** and **Send test security alert**.
4. Open `/signup` and complete a real signup with your own e-mail to prove OTP delivery.

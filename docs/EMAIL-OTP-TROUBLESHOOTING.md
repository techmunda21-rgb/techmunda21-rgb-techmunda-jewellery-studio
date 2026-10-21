# E-mail OTP not arriving? (Render)

**Most likely cause:** Render's free web services block outbound SMTP ports (25, 465, 587), so Gmail SMTP cannot connect from there. Use the HTTPS e-mail API instead:

1. Create a free account at https://www.brevo.com (300 e-mails/day free).
2. Brevo -> *Senders, Domains & Dedicated IPs* -> *Senders* -> add `techmunda21@gmail.com` and click the verification link Brevo e-mails you.
3. Brevo -> *SMTP & API* -> *API keys* -> *Generate a new API key* (starts `xkeysib-`).
4. Render -> *techmunda-api* -> Environment -> add `BREVO_API_KEY` = that key. Keep `SMTP_FROM` = `Techmunda <techmunda21@gmail.com>` (the same verified sender). Save (redeploys).
5. Sign in as platform admin -> Settings -> Platform -> run **Check readiness** and **Send test e-mail**. It should show mode `brevo-api`.

If `BREVO_API_KEY` is set it is used instead of SMTP. Other causes: the sender is not verified in Brevo (API returns 4xx), the code landed in spam, or no key/SMTP is set (the signup page then says verification is unavailable; it never fakes a code).

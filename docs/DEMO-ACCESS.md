# Demo access (for client presentations)

URL: your Render web address (e.g. `https://techmunda-web.onrender.com`) → sign in. All demo users share one password.

**Set a private password before sharing the link:** Render → *techmunda-api* → Environment → `DEMO_PASSWORD` = a password of your choice → save. On the next start the API updates every demo login to that password (existing sessions are signed out). Until you set it, the default is `Demo@12345` — **do not leave the default on a public URL.**

| Role | Email | What it shows the client |
|---|---|---|
| Owner | `owner@suvarna.demo` | Everything: dashboard, showcase PDF, approvals, settings, Gmail connection, audit log |
| Manager | `manager@suvarna.demo` | Approve emails and creative assets, import catalogue/PDF, analytics |
| Designer | `designer@suvarna.demo` | Products, Creative Studio, 360° frames, asset approval, showcase upload |
| Sales executive | `sales@suvarna.demo`, `sales2@suvarna.demo` | Leads, CRM board, drafting follow-ups, **sending** approved emails (cannot approve) |
| Viewer | `viewer@suvarna.demo` | Read-only everywhere (shows the safety of role-based access) |
| Second shop (tenant isolation) | `owner@alnoor.demo` | A different jeweller: shows nobody can see another shop's data |
| Platform admin | `admin@techmunda.demo` | Techmunda staff account (own empty workspace) |

Public customer page for the "enquiry" step: `/enquiry/suvarna-heritage` (no login).

## Things to know on the free Render plan
* The first request after ~15 minutes idle takes about a minute (service waking up).
* Files are stored on the server's temporary disk. When the service restarts, the demo data **and anything uploaded during the demo (PDFs, photos, 360° frames, leads) is recreated from the seed** — so do client-specific uploads right before the meeting, or attach an S3 bucket / paid disk to keep them.
* Gmail sending stays blocked until you connect Google (see `docs/DEPLOYMENT.md`). Anyone with an Owner/Manager/Sales login could then send email from that account, which is why the private `DEMO_PASSWORD` matters.

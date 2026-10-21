# Product requirements — Techmunda AI Jewellery Growth Studio (3-day demo)

**Users:** jewellery owners/managers (approve, analytics), designers (visuals), sales executives (leads, follow-ups), viewers. **Markets:** India (INR) and Dubai (AED). Marketing partner: USYNC & Co.

**Goals:** (1) turn existing product photos into styled marketing assets with human accuracy review; (2) keep an accurate catalogue; (3) capture enquiries with explicit consent; (4) qualify and prioritise them automatically and transparently; (5) manage them in a CRM; (6) prepare personalised follow-ups that a person approves and then deliberately sends; (7) show daily sales and content-production status.

**Non-goals (this release):** ad-platform publishing/performance metrics, WhatsApp/SMS, inbound email sync, billing, self-service sign-up, SSO/MFA, claims of enterprise readiness.

**Principles:** no external message or publication without a human decision; AI never invents product specs, prices or budgets; simulated behaviour is always labelled; tenant data never crosses tenants; secrets only via environment.

**Success (demo acceptance):** a user logs in, creates a product, uploads an authorised image, generates and reviews variations; a customer submits an enquiry; it is qualified and visible in the CRM; a follow-up draft is generated, reviewed, approved and — only when Gmail OAuth is connected — deliberately sent, with the activity visible in the CRM timeline. Without credentials the blocked state is shown honestly.

**UI:** royal-red / antique-gold / warm-cream heritage design system across nine screens (login, dashboard, catalogue, creative studio, asset review, public enquiry, lead qualification, Kanban CRM, Gmail approval), responsive from 390 px.

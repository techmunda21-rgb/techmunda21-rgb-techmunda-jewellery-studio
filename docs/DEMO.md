# 10-minute client demo

**Prep:** `pnpm db:seed`, start API + worker + web, sign in as `owner@suvarna.demo` / `Demo@12345`. Everything is synthetic. Product/hero images are crops of the reference imagery supplied by the project owner (`packages/database/seed-assets`, low resolution, concept imagery) — swap in client-authorised photos for real pitches. Have a second browser tab on `/enquiry/suvarna-heritage`.

| Min | Show | Say / point out |
|---|---|---|
| 1 | **Overview** | KPIs, pipeline chart, revenue, recent enquiries; "AI: Demo simulation" pill = honesty about what is live |
| 2 | **Products** | Catalogue grid, search/filter, open a product; specs are entered by the team — AI never invents them |
| 3 | **Creative Studio → upload** | Pick *Diamond Necklace*, tick the "client-authorised" box, drop a JPG/PNG (try a renamed .txt to show rejection) |
| 4 | **Generate** | Style *Diwali festive*, 4:5, 2 variations → progress → results. Note the `DEMO SIMULATION` badge unless `OPENAI_API_KEY` is set |
| 5 | **Review & approve** | Compare original vs generated, read accuracy flags, *Submit for Review* → *Approve* requires the 4-point checklist; unapproved assets can't export or join a campaign |
| 6 | **Enquiry page** | Submit as a customer (consent box is unticked by default). Nothing private is echoed back |
| 7 | **Lead qualification** | Open the new lead: extracted intent/budget/timeline, score breakdown (heuristic, not probability), reason, next action; missing fields stay "Not stated" |
| 8 | **CRM** | Cards show the matching product photo; lead already in *Qualified*; drag a card, open the AI assistant sidebar; stage change updates the opportunity |
| 9 | **Draft → approve → send** | *Draft follow-up email* → Approvals: review the branded **Email preview** (what the recipient sees), **Approve & Save to Gmail Draft**, then the separate **Confirm & Send** dialog. Edit after approving to show the approval being voided. Without Google OAuth, show the *blocked* banner (this is the honest state) |
| 10 | **Timeline & dashboard** | Lead timeline (enquiry → qualified → draft → approved [→ sent]), Analytics page, Settings → audit log |

## Live vs simulated
| Feature | Live when | Otherwise |
|---|---|---|
| Qualification, drafts, reply ideas | `OPENAI_API_KEY` | Rule engine / template, labelled |
| Image variations | `OPENAI_API_KEY` | Backdrop compositing of the original, watermark "DEMO SIMULATION" |
| Gmail draft & send | Google OAuth connected | Blocked with explanation; **no fake success** |
| Everything else | always | — |

Catalogue add-on (2 min): open `docs/catalogue/suvarna-heritage-catalogue.pdf`, then Products → Import CSV with the matching CSV into a fresh workspace, open a product to show purity/fineness/pure-gold grams, and the 360° tab (upload turntable frames to enable it).

Reset between demos: `pnpm db:seed`.

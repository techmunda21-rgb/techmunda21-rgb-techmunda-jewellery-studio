// Storyboard carousel: "A day with Techmunda" - 7 frames (4:5) + one overview board. Run: CHROMIUM_PATH=... node build-storyboard.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { chromium } = require('@playwright/test');
const b64 = (f, m) => `data:${m};base64,${fs.readFileSync(f).toString('base64')}`;
const font = (p, f) => fs.readFileSync(path.join(web, 'node_modules/@fontsource', p, 'files', f)).toString('base64');
const sl = (n) => b64(path.join(web, 'public/images/slides', n), 'image/jpeg');
const shot = (n) => b64(path.join(here, 'assets', n), 'image/png');
const emblem = b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png');
const fonts = `
@font-face{font-family:'Cormorant';font-weight:600;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Cormorant';font-weight:600;font-style:italic;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-italic.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-700-normal.woff2')}) format('woff2')}`;
const css = `${fonts}
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;color:#F8EEDB;position:relative;background:radial-gradient(1200px 900px at 20% 0%,#7a0f20 0%,#461318 48%,#2e0a0e 100%)}
.frame{position:absolute;inset:26px;border:2px solid rgba(184,138,54,.7);border-radius:30px}
.wrap{position:absolute;inset:0;padding:76px 80px 66px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:16px}.brand img{width:60px;height:60px;border-radius:50%;background:#FFF9EF;padding:3px;border:2px solid #B88A36}.brand b{font-family:Cormorant,Georgia,serif;font-size:38px;font-weight:600;color:#FFF9EF}
.brand .sc{margin-left:auto;text-align:right;font-size:20px;font-weight:700;letter-spacing:.2em;color:#D9B15E}
.say{margin-top:36px;font-family:Cormorant,Georgia,serif;font-style:italic;font-size:44px;line-height:1.15;color:#E3BF68}
h1{font-family:Cormorant,Georgia,serif;font-weight:600;font-size:88px;line-height:1.02;color:#FFF9EF;margin-top:12px}h1 em{color:#E3BF68}
.stage{margin-top:34px;flex:1;position:relative;min-height:0}
.card{border-radius:24px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 30px 70px rgba(0,0,0,.55);background:#F8EEDB}.card img{display:block;width:100%}
.arch{border-radius:260px 260px 26px 26px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 30px 70px rgba(0,0,0,.5);background-size:cover;background-position:center}
.cap{font-size:32px;line-height:1.4;color:#E8D9BD;margin-top:24px}.cap b{color:#FFF9EF}
.tag{position:absolute;right:0;bottom:0;font-size:22px;font-weight:700;letter-spacing:.16em;color:#D9B15E}
.chip{display:inline-block;margin:0 10px 10px 0;padding:12px 22px;border:2px solid rgba(217,177,94,.7);border-radius:999px;font-size:26px;color:#FFF9EF;background:rgba(46,10,14,.55)}
.btn{display:inline-block;background:linear-gradient(180deg,#F1D58E,#C99A42);color:#3a0b12;font-weight:700;font-size:42px;padding:26px 60px;border-radius:999px;box-shadow:0 14px 30px rgba(0,0,0,.4)}
.fine{font-size:19px;color:#BFA982;margin-top:14px}`;
const shell = (n, say, h1, stage, cap) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="frame"></div><div class="wrap"><div class="brand"><img src="${emblem}"><b>Techmunda</b><span class="sc">SCENE ${n} / 7</span></div><div class="say">${say}</div><h1>${h1}</h1><div class="stage">${stage}</div><div class="cap">${cap}</div></div></body></html>`;
const F = [
  shell(1, '“Another busy Saturday at the showroom.”', 'Enquiries everywhere. <em>Control nowhere.</em>', `<div class="arch" style="height:100%;max-height:520px;background-image:url(${sl('bridal-model.jpg')});background-position:50% 30%"></div>`, 'A jeweller juggles chats, calls and walk-ins. <b>Sound familiar?</b> (Illustrative story, not a real client.)'),
  shell(2, '“A customer asks about a bridal set.”', 'One page <em>catches every enquiry.</em>', `<div class="card"><img src="${shot('app-enquiry.png')}"></div>`, 'Customers fill your <b>enquiry page</b>. Consent is recorded. Leads land in one place.'),
  shell(3, '“Who is serious? Who is just looking?”', 'AI scores it. <em>You decide.</em>', `<div><span class="chip">Budget ₹10L+</span><span class="chip">Wedding in 3 months</span><span class="chip">Wants appointment</span></div><div class="card" style="margin-top:18px"><img src="${shot('app-crm.png')}"></div>`, 'Clear <b>score and reason</b> on every lead. Scores are rule-based guidance, not a verdict.'),
  shell(4, '“Where is each lead right now?”', 'A board you <em>understand at a glance.</em>', `<div class="card"><img src="${shot('app-crm.png')}"></div>`, 'Kanban CRM with your <b>real product photos</b>: New, Qualified, Contacted, Demo.'),
  shell(5, '“I need fresh pictures for the festive sale.”', 'Studio visuals, <em>approved by you.</em>', `<div style="display:flex;gap:24px;height:100%;max-height:520px"><div class="arch" style="flex:1;background-image:url(${sl('emerald-necklace.jpg')})"></div><div class="arch" style="flex:1;background-image:url(${sl('temple-bangles.jpg')})"></div></div>`, 'Create variations from your own photos. <b>Nothing is used until you approve it.</b>'),
  shell(6, '“Time to follow up, the right way.”', 'Drafts wait. <em>You press send.</em>', `<div class="card"><img src="${shot('app-approvals.png')}"></div>`, 'Branded e-mail drafts need <b>your approval</b> before anything goes out.'),
  shell(7, '“That was easy.”', 'Manage every customer <em>the easy way.</em>', `<div><span class="chip">Product visuals</span><span class="chip">Lead capture</span><span class="chip">AI scoring</span><span class="chip">Kanban CRM</span><span class="chip">Approved follow-ups</span></div><div style="margin-top:40px"><span class="btn">Book a free demo</span></div><div class="fine">Link in bio · www.techmunda.co.in · Screens show sample data.</div>`, 'Built for jewellers in <b>India &amp; Dubai</b>.'),
];
const out = path.join(here, 'out/storyboard'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (let i = 0; i < F.length; i++) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(F[i]); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `scene-${i + 1}-of-7.png`) });
  await page.screenshot({ path: path.join(out, `scene-${i + 1}-of-7.jpg`), type: 'jpeg', quality: 92 });
  await page.close();
}
await browser.close(); console.log('done');

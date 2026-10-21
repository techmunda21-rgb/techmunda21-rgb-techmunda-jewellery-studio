// Renders the Meta ad posters (1:1, 4:5, 9:16) from real brand assets + real app screenshots.
// Run: node build-posters.mjs   (needs apps/web deps installed; screenshots from `CAPTURE_ADS=1 playwright test e2e/capture-ads.spec.ts`)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { chromium } = require('@playwright/test');
const b64 = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`;
const font = (pkg, file) => fs.readFileSync(path.join(web, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');

const fonts = `
@font-face{font-family:'Cormorant';font-weight:600;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Cormorant';font-weight:600;font-style:italic;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-italic.woff2')}) format('woff2')}
@font-face{font-family:'Playfair';font-weight:600;src:url(data:font/woff2;base64,${font('playfair-display', 'playfair-display-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-700-normal.woff2')}) format('woff2')}`;

const emblem = b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png');
const model = b64(path.join(web, 'public/images/model-bridal.jpg'), 'image/jpeg');
const crm = b64(path.join(here, 'assets/app-crm.png'), 'image/png');
const approvals = b64(path.join(here, 'assets/app-approvals.png'), 'image/png');

const motif = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 120 120'><g fill='none' stroke='%23B88A36' stroke-opacity='0.18' stroke-width='1'><circle cx='60' cy='60' r='6'/><path d='M60 54 C48 40 48 26 60 14 C72 26 72 40 60 54Z'/><path d='M60 66 C72 80 72 94 60 106 C48 94 48 80 60 66Z'/><path d='M54 60 C40 72 26 72 14 60 C26 48 40 48 54 60Z'/><path d='M66 60 C80 48 94 48 106 60 C94 72 80 72 66 60Z'/></g></svg>")`;

/** Per-format layout numbers. `safeTop/safeBottom` keep key content clear of Stories/Reels UI overlays. */
const FORMATS = {
  '1x1-feed': { w: 1080, h: 1080, safeTop: 0, safeBottom: 0, head: 86, sub: 28, photoW: 330, photoH: 400, shotW: 560, chips: false, gap: 28 },
  '4x5-feed': { w: 1080, h: 1350, safeTop: 0, safeBottom: 0, head: 90, sub: 27, photoW: 310, photoH: 380, shotW: 540, chips: true, gap: 26 },
  '9x16-stories': { w: 1080, h: 1920, safeTop: 250, safeBottom: 330, head: 100, sub: 30, photoW: 400, photoH: 470, shotW: 640, chips: true, gap: 34 },
};

const FEATURES = [
  ['Studio-quality product visuals', 'you approve every image'],
  ['Capture & qualify enquiries', 'AI-scored, consent recorded'],
  ['Kanban CRM + follow-ups', 'nothing sent without your OK'],
];

function html(f) {
  const chips = f.chips ? `<ul class="chips">${FEATURES.map(([a, b]) => `<li><i>◆</i><span><b>${a}</b><em>${b}</em></span></li>`).join('')}</ul>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.w}px;height:${f.h}px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;color:#F8EEDB;background:radial-gradient(1200px 900px at 20% 0%,#7a0f20 0%,#461318 48%,#2e0a0e 100%);position:relative}
.motif{position:absolute;inset:0;background-image:${motif};background-size:160px 160px;opacity:.55}
.frame{position:absolute;inset:26px;border:2px solid rgba(184,138,54,.75);border-radius:30px}
.frame:after{content:'';position:absolute;inset:10px;border:1px solid rgba(184,138,54,.35);border-radius:22px}
.wrap{position:absolute;inset:0;padding:${70 + f.safeTop}px 78px ${56 + f.safeBottom}px;display:flex;flex-direction:column;gap:${f.gap}px}
.brand{display:flex;align-items:center;gap:20px}
.brand img{width:92px;height:92px;border-radius:50%;background:#FFF9EF;padding:4px;border:2px solid #B88A36}
.brand b{display:block;font-family:Cormorant,Georgia,serif;font-size:50px;line-height:1;font-weight:600;color:#FFF9EF;letter-spacing:1px}
.brand small{display:block;margin-top:8px;font-size:15px;font-weight:700;letter-spacing:.3em;color:#D9B15E}
h1{font-family:Cormorant,Georgia,serif;font-weight:600;font-size:${f.head}px;line-height:.98;color:#FFF9EF;letter-spacing:-.01em}
h1 em{font-style:italic;color:#E3BF68}
.sub{font-size:${f.sub}px;line-height:1.45;color:#E8D9BD;max-width:${f.w - 220}px}
.sub b{color:#FFF9EF;font-weight:700}
.visual{position:relative;flex:none;height:${f.photoH + 20}px}
.photo{position:absolute;left:0;top:0;width:${f.photoW}px;height:${f.photoH}px;border-radius:${f.photoW / 2}px ${f.photoW / 2}px 26px 26px;overflow:hidden;border:3px solid #D9B15E;box-shadow:0 30px 60px rgba(0,0,0,.45);background:url(${model}) 50% 72%/cover}
.shot{position:absolute;right:0;top:${Math.round(f.photoH * 0.16)}px;width:${f.shotW}px;border-radius:22px;overflow:hidden;border:3px solid #D9B15E;box-shadow:0 30px 70px rgba(0,0,0,.55);background:#F8EEDB}
.shot img{display:block;width:100%}
.shot .bar{position:absolute;left:0;right:0;bottom:0;padding:14px 18px;background:linear-gradient(transparent,rgba(46,10,14,.88));font-size:20px;font-weight:700;letter-spacing:.06em;color:#F8EEDB}
.shot2{position:absolute;right:${Math.round(f.shotW * 0.36)}px;top:${Math.round(f.photoH * 0.16) + Math.round(f.shotW * 0.5)}px;width:${Math.round(f.shotW * 0.5)}px;border-radius:16px;overflow:hidden;border:3px solid #D9B15E;box-shadow:0 22px 50px rgba(0,0,0,.55)}
.shot2 img{display:block;width:100%}
.chips{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.chips li{display:flex;gap:12px;align-items:flex-start;padding:16px 16px;border:1.5px solid rgba(217,177,94,.6);border-radius:18px;background:rgba(46,10,14,.55)}
.chips i{font-style:normal;color:#E3BF68;font-size:22px;line-height:1.1}
.chips b{display:block;font-size:${f.w > 1000 && f.h > 1500 ? 24 : 21}px;line-height:1.25;color:#FFF9EF}
.chips em{display:block;margin-top:5px;font-style:normal;font-size:${f.h > 1500 ? 20 : 17}px;color:#D9C7A0}
.cta{display:flex;align-items:center;gap:26px;flex-wrap:nowrap}
.btn{display:inline-flex;align-items:center;gap:14px;background:linear-gradient(180deg,#F1D58E,#C99A42);color:#3a0b12;font-weight:700;font-size:${f.h > 1500 ? 40 : 34}px;padding:${f.h > 1500 ? 28 : 22}px ${f.h > 1500 ? 54 : 44}px;border-radius:999px;box-shadow:0 14px 30px rgba(0,0,0,.4);white-space:nowrap}
.url{font-size:${f.h > 1500 ? 32 : 27}px;font-weight:700;color:#FFF9EF;letter-spacing:.02em}
.url small{display:block;margin-top:4px;font-size:${f.h > 1500 ? 22 : 18}px;font-weight:500;color:#D9B15E;letter-spacing:.2em;text-transform:uppercase}
.fine{font-size:${f.h > 1500 ? 20 : 16}px;color:#BFA982;line-height:1.5;display:flex;justify-content:space-between;gap:20px}
</style></head><body><div class="motif"></div><div class="frame"></div>
<div class="wrap">
  <div class="brand"><img src="${emblem}" alt=""><div><b>Techmunda</b><small>AI JEWELLERY GROWTH STUDIO</small></div></div>
  <h1>Show it beautifully.<br><em>Sell it smartly.</em></h1>
  <p class="sub"><b>Product visuals, lead capture, CRM and follow-ups</b> — one studio built for jewellers in India &amp; Dubai.</p>
  <div class="visual"><div class="photo"></div><div class="shot"><img src="${crm}" alt=""><div class="bar">KANBAN CRM · REAL PRODUCT PHOTOS</div></div></div>
  ${chips}
  <div class="cta"><span class="btn">Book a free demo&nbsp;→</span><div class="url">www.techmunda.co.in<small>Free demo workspace</small></div></div>
  <div class="fine"><span>AI visuals are reviewed &amp; approved by you before use. Screens show sample data.</span><span>With USYNC &amp; Co.</span></div>
</div></body></html>`;
}

const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const [name, f] of Object.entries(FORMATS)) {
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
  await page.setContent(html(f), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `techmunda-meta-${name}.png`) });
  await page.screenshot({ path: path.join(out, `techmunda-meta-${name}.jpg`), type: 'jpeg', quality: 92 });
  await page.close();
  console.log('rendered', name);
}
await browser.close();

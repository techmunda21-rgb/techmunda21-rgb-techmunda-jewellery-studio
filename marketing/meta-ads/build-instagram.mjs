// Renders Instagram lead-generation images: a 6-slide 4:5 carousel + 2 single 1:1 posts.
// Run: CHROMIUM_PATH=... node build-instagram.mjs   Output: out/instagram/*.png|jpg
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
const slide = (n) => b64(path.join(web, 'public/images/slides', n), 'image/jpeg');
const shot = (n) => b64(path.join(here, 'assets', n), 'image/png');
const emblem = b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png');

const fonts = `
@font-face{font-family:'Cormorant';font-weight:600;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Cormorant';font-weight:600;font-style:italic;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-italic.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-700-normal.woff2')}) format('woff2')}`;

const css = (W, H) => `${fonts}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;color:#F8EEDB;position:relative;background:radial-gradient(1200px 900px at 20% 0%,#7a0f20 0%,#461318 48%,#2e0a0e 100%)}
.frame{position:absolute;inset:26px;border:2px solid rgba(184,138,54,.7);border-radius:30px}
.wrap{position:absolute;inset:0;padding:78px 84px 70px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:16px}
.brand img{width:64px;height:64px;border-radius:50%;background:#FFF9EF;padding:3px;border:2px solid #B88A36}
.brand b{font-family:Cormorant,Georgia,serif;font-size:40px;font-weight:600;color:#FFF9EF}
.brand .pg{margin-left:auto;font-size:22px;font-weight:700;letter-spacing:.2em;color:#D9B15E}
.kick{font-size:26px;font-weight:700;letter-spacing:.3em;color:#D9B15E;margin-top:44px}
h1{font-family:Cormorant,Georgia,serif;font-weight:600;font-size:96px;line-height:1.02;color:#FFF9EF;margin-top:18px}
h1 em{color:#E3BF68}
p.sub{font-size:36px;line-height:1.45;color:#E8D9BD;margin-top:26px}
p.sub b{color:#FFF9EF}
.arch{border-radius:300px 300px 28px 28px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 30px 70px rgba(0,0,0,.5);background-size:cover;background-position:center}
.card{border-radius:24px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 30px 70px rgba(0,0,0,.55);background:#F8EEDB}
.card img{display:block;width:100%}
.swipe{margin-top:auto;font-size:28px;font-weight:700;letter-spacing:.18em;color:#D9B15E;text-align:right}
.btn{display:inline-block;background:linear-gradient(180deg,#F1D58E,#C99A42);color:#3a0b12;font-weight:700;font-size:44px;padding:28px 64px;border-radius:999px;box-shadow:0 14px 30px rgba(0,0,0,.4)}
ul.chk{list-style:none;margin-top:34px;display:flex;flex-direction:column;gap:22px}
ul.chk li{display:flex;gap:22px;align-items:flex-start;padding:26px 30px;border:2px solid rgba(217,177,94,.6);border-radius:22px;background:rgba(46,10,14,.55);font-size:36px;line-height:1.3;color:#FFF9EF}
ul.chk i{font-style:normal;color:#E3BF68;font-size:34px}
ul.chk span{display:block;font-size:27px;color:#D9C7A0;margin-top:6px}
.fine{font-size:20px;color:#BFA982;margin-top:18px}`;

const shell = (W, H, body, page) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(W, H)}</style></head><body><div class="frame"></div><div class="wrap"><div class="brand"><img src="${emblem}"><b>Techmunda</b>${page ? `<span class="pg">${page}</span>` : ''}</div>${body}</div></body></html>`;

const swipe = '<div class="swipe">SWIPE →</div>';
const CAR = [
  shell(1080, 1350, `<div class="kick">FOR JEWELLERY SHOPS</div><h1>Enquiries lost in <em>WhatsApp chats?</em></h1>
    <div class="arch" style="height:640px;margin-top:40px;background-image:url(${slide('bridal-model.jpg')});background-position:50% 30%"></div>${swipe}`, '1/6'),
  shell(1080, 1350, `<div class="kick">SOUND FAMILIAR?</div><h1>Blurry photos.<br>Missed enquiries.<br><em>Late follow-ups.</em></h1>
    <p class="sub">Great jewellery deserves a <b>system</b>, not scattered chats, notes and memory.</p>
    <ul class="chk"><li><i>◆</i><div>Product photos that don't do the piece justice</div></li><li><i>◆</i><div>Who enquired about what? Nobody remembers</div></li><li><i>◆</i><div>The warm lead went cold last week</div></li></ul>${swipe}`, '2/6'),
  shell(1080, 1350, `<div class="kick">01 · PRODUCT VISUALS</div><h1>Show it <em>beautifully.</em></h1>
    <div style="display:flex;gap:26px;margin-top:36px"><div class="arch" style="flex:1;height:560px;background-image:url(${slide('emerald-necklace.jpg')})"></div><div class="arch" style="flex:1;height:560px;background-image:url(${slide('jhumka-earrings.jpg')})"></div></div>
    <p class="sub">Studio-style product visuals from your own photos. <b>You approve every image</b> before it is used.</p>${swipe}`, '3/6'),
  shell(1080, 1350, `<div class="kick">02 · LEAD CAPTURE</div><h1>Every enquiry, <em>captured &amp; scored.</em></h1>
    <div class="card" style="margin-top:36px"><img src="${shot('app-crm.png')}"></div>
    <p class="sub">A public enquiry page, AI-scored leads and a Kanban pipeline with your <b>real product photos</b>.</p>${swipe}`, '4/6'),
  shell(1080, 1350, `<div class="kick">03 · FOLLOW-UPS</div><h1>Nothing is sent <em>without your OK.</em></h1>
    <div class="card" style="margin-top:36px"><img src="${shot('app-approvals.png')}"></div>
    <p class="sub">Branded e-mail drafts wait for your approval. <b>You stay in control.</b></p>${swipe}`, '5/6'),
  shell(1080, 1350, `<div class="kick">FREE DEMO WORKSPACE</div><h1>See it with <em>your</em> jewellery.</h1>
    <p class="sub">Try a free demo workspace built for jewellers in <b>India &amp; Dubai</b>.</p>
    <ul class="chk"><li><i>1</i><div>Tap the link in bio<span>or DM us the word <b>DEMO</b></span></div></li><li><i>2</i><div>Sign up with e-mail or mobile OTP</div></li><li><i>3</i><div>Explore the studio, CRM and approvals</div></li></ul>
    <div style="margin-top:auto;display:flex;align-items:center;gap:26px"><span class="btn">Book a free demo</span></div><div class="fine">Demo data is sample data. Demo workspaces are deleted after 30 days.</div>`, '6/6'),
];

const SINGLES = {
  'post-1x1-free-demo': shell(1080, 1080, `<div class="kick">NOW LIVE</div><h1>The AI growth studio <em>for jewellers.</em></h1>
    <div style="display:flex;gap:30px;margin-top:34px;align-items:flex-end"><div class="arch" style="width:360px;height:380px;background-image:url(${slide('bridal-set.jpg')})"></div><div style="flex:1"><p class="sub" style="margin-top:0;font-size:34px">Visuals · Lead capture · CRM · Follow-ups</p><div style="margin-top:30px"><span class="btn" style="font-size:36px;padding:24px 44px">Free demo · link in bio</span></div></div></div>`, null),
  'post-1x1-checklist': shell(1080, 1080, `<div class="kick">QUICK CHECK</div><h1 style="font-size:84px">3 things your shop <em>should track.</em></h1>
    <ul class="chk" style="margin-top:26px;gap:16px"><li style="padding:20px 28px;font-size:34px"><i>◆</i><div>Who enquired, and for which piece</div></li><li style="padding:20px 28px;font-size:34px"><i>◆</i><div>Who needs a follow-up today</div></li><li style="padding:20px 28px;font-size:34px"><i>◆</i><div>Which leads are ready to buy</div></li></ul>
    <p class="sub" style="font-size:32px;margin-top:24px">Techmunda does all three. <b>Free demo — link in bio.</b></p>`, null),
};

const out = path.join(here, 'out/instagram'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function render(html, W, H, name) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 92 });
  await page.close();
}
for (let i = 0; i < CAR.length; i++) await render(CAR[i], 1080, 1350, `carousel-${i + 1}-of-6`);
for (const [n, h] of Object.entries(SINGLES)) await render(h, 1080, 1080, n);
await browser.close();
console.log('done');

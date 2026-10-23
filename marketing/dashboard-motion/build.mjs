// Dashboard UI motion graphic (1920x1080, 12s, 24fps). Outputs: out/dashboard-motion.mp4, out/dashboard-motion.html (live, loops), out/final-frame.png
// Run: CHROMIUM_PATH=... node build.mjs   (needs ffmpeg). All figures are SAMPLE data and are labelled as such in the frame.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { chromium } = require('@playwright/test');
const b64 = (f, m) => `data:${m};base64,${fs.readFileSync(f).toString('base64')}`;
const font = (p, f) => fs.readFileSync(path.join(web, 'node_modules/@fontsource', p, 'files', f)).toString('base64');
const sl = (n) => b64(path.join(web, 'public/images/slides', n), 'image/jpeg');
const emblem = b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png');
const W = 1920, H = 1080, FPS = 24, DUR = 12;

const nav = ['Overview', 'Products', 'Creative Studio', 'Campaigns', 'Leads', 'CRM', 'Approvals', 'Analytics', 'Settings'];
const cols = [
  ['New', '#780514', [['bridal-set.jpg', 'Neha Singh', 'Bridal Set'], ['emerald-necklace.jpg', 'Rohit Kapoor', 'Emerald Necklace']]],
  ['Qualified', '#0f4c5c', [['jhumka-earrings.jpg', 'Priya Mehta', 'Jhumka Earrings'], ['solitaire-ring.jpg', 'Rahul Bansal', 'Solitaire Ring']]],
  ['Contacted', '#8a6a1f', [['floral-pendant.jpg', 'Diya Menon', 'Floral Pendant'], ['temple-bangles.jpg', 'Meghna Rao', 'Temple Bangles']]],
  ['Demo / Appt.', '#461318', [['bridal-model.jpg', 'Sneha Jain', 'Bridal Collection'], ['emerald-necklace.jpg', 'Ananya Gupta', 'Custom Design']]],
];
const kpis = [['New leads', 128, '', 'rgb(120 5 20)'], ['Qualified', 46, '', '#0f4c5c'], ['Awaiting approval', 7, '', '#8a6a1f'], ['Pipeline', 24.6, '₹ L', '#461318']];

const css = `
@font-face{font-family:'Cormorant';font-weight:600;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Cormorant';font-weight:600;font-style:italic;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-italic.woff2')}) format('woff2')}
@font-face{font-family:'Playfair';font-weight:600;src:url(data:font/woff2;base64,${font('playfair-display', 'playfair-display-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-700-normal.woff2')}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;color:#351B1D;background:radial-gradient(1500px 1000px at 15% 0%,#7a0f20 0%,#461318 52%,#2e0a0e 100%);position:relative}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(217,177,94,.25),transparent 65%);right:-200px;bottom:-300px}
#intro{position:absolute;left:0;right:0;top:70px;text-align:center;color:#FFF9EF}
#intro b{font-family:Cormorant,Georgia,serif;font-size:64px;font-weight:600}#intro b em{color:#E3BF68}
#win{position:absolute;left:150px;top:190px;width:1620px;height:800px;border-radius:26px;overflow:hidden;background:#F8EEDB;border:3px solid #D9B15E;box-shadow:0 50px 120px rgba(0,0,0,.6);display:flex;transform-origin:50% 100%}
#side{width:270px;background:#461318;padding:26px 18px;color:#F8EEDB;flex:none}
.logo{display:flex;align-items:center;gap:12px;margin-bottom:30px}.logo img{width:46px;height:46px;border-radius:50%;background:#FFF9EF;padding:2px;border:2px solid #B88A36}.logo b{font-family:Cormorant,Georgia,serif;font-size:30px;font-weight:600}
.nv{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;font-size:17px;font-weight:500;color:#E8D9BD;margin-bottom:6px;border:1px solid transparent;position:relative}
.nv i{width:8px;height:8px;border-radius:2px;background:#B88A36}
.nv.on{background:rgba(184,138,54,.22);border-color:#B88A36;color:#FFF9EF}
#main{flex:1;position:relative;padding:26px 30px}
.top{display:flex;justify-content:space-between;align-items:center}
.top h2{font-family:Playfair,Georgia,serif;font-size:34px;font-weight:600}.top p{font-size:15px;color:#705250;margin-top:4px}
.pill{font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;background:#F3E3BF;color:#7a5a17;border:1px solid #D9B15E}
.scene{position:absolute;left:30px;right:30px;top:104px;bottom:24px;opacity:0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.kpi{background:#FFF9EF;border:1.5px solid rgba(184,138,54,.5);border-radius:18px;padding:18px 20px;box-shadow:0 8px 20px rgba(70,19,24,.08)}
.kpi b{display:block;font-family:Playfair,Georgia,serif;font-size:46px;font-weight:600;line-height:1}.kpi span{display:block;margin-top:8px;font-size:15px;color:#705250}.kpi u{text-decoration:none;font-size:15px;font-weight:700;color:#2f7a4d;display:block;margin-top:6px}
.row2{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:18px}
.card{background:#FFF9EF;border:1.5px solid rgba(184,138,54,.5);border-radius:18px;padding:18px 20px}
.card h3{font-family:Playfair,Georgia,serif;font-size:21px;font-weight:600;margin-bottom:10px}
.bars{display:flex;flex-direction:column;gap:30px;margin-top:22px}.bar{display:flex;align-items:center;gap:12px;font-size:14px}.bar em{font-style:normal;width:96px;color:#705250}.bar div{height:18px;border-radius:9px;background:linear-gradient(90deg,#780514,#B88A36)}
.kan{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;height:100%}
.col{background:rgba(255,249,239,.6);border-radius:16px;border:1.5px solid rgba(184,138,54,.35);padding:10px;overflow:hidden}
.ch{color:#FFF9EF;font-weight:700;font-size:15px;padding:10px 12px;border-radius:10px;margin-bottom:10px}
.lc{background:#FFF9EF;border:1.5px solid rgba(184,138,54,.45);border-radius:14px;overflow:hidden;margin-bottom:12px;box-shadow:0 8px 18px rgba(70,19,24,.1)}
.lc .im{height:150px;background-size:cover;background-position:center}.lc div.tx{padding:10px 12px}.lc b{font-size:16px;display:block}.lc span{font-size:13px;color:#705250}
.appr{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;height:100%}
.mail{background:#FFF9EF;border:1.5px solid rgba(184,138,54,.5);border-radius:18px;overflow:hidden}
.mh{background:#461318;color:#F8EEDB;text-align:center;padding:16px;font-family:Cormorant,Georgia,serif;font-size:28px;border-bottom:3px solid #B88A36}
.mb{padding:22px 26px;font-size:17px;line-height:1.6}.mb p{margin-bottom:12px}
.stat{display:inline-block;font-size:14px;font-weight:700;padding:6px 14px;border-radius:999px;position:relative}
.btn{display:inline-block;font-weight:700;font-size:18px;padding:14px 30px;border-radius:12px;background:#780514;color:#FFF9EF;border:2px solid #B88A36}
.check{width:120px;height:120px;border-radius:50%;background:#2f7a4d;color:#fff;font-size:70px;display:flex;align-items:center;justify-content:center;margin:0 auto}
#cursor{position:absolute;width:30px;height:30px;z-index:9;left:0;top:0;opacity:0}
#cursor svg{filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))}
#outro{position:absolute;left:0;right:0;bottom:36px;text-align:center;color:#E8D9BD;font-size:22px;opacity:0}
#fine{position:absolute;left:0;right:0;bottom:12px;text-align:center;color:#BFA982;font-size:14px}
`;

const html = (loop) => `<!doctype html><html><head><meta charset="utf-8"><title>Techmunda dashboard motion</title><style>${css}</style></head><body><div class="glow"></div>
<div id="intro"><b>Your whole jewellery business, <em>one studio.</em></b></div>
<div id="win">
 <div id="side"><div class="logo"><img src="${emblem}"><b>Techmunda</b></div>${nav.map((n, i) => `<div class="nv" id="nv${i}"><i></i>${n}</div>`).join('')}</div>
 <div id="main">
  <div class="top"><div><h2 id="ttl">Good morning, Aarav</h2><p id="sub">Here’s what’s happening with your jewellery business · last 30 days</p></div><span class="pill">AI: Demo simulation</span></div>
  <div class="scene" id="sc1"><div class="kpis">${kpis.map((k, i) => `<div class="kpi" id="k${i}"><b><span id="kv${i}" style="display:inline;margin:0;color:inherit;font-size:inherit">0</span>${k[2] ? `<small style="font-size:20px"> ${k[2]}</small>` : ''}</b><span>${k[0]}</span><u>▲ sample trend</u></div>`).join('')}</div>
   <div class="row2"><div class="card"><h3>Leads over time</h3><svg viewBox="0 0 800 325" width="100%" height="325"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#B88A36" stop-opacity=".45"/><stop offset="1" stop-color="#B88A36" stop-opacity="0"/></linearGradient></defs><g transform="scale(1 1.3)"><path id="area" d="M0 210 C80 190 120 170 190 175 C270 180 300 120 380 115 C460 110 500 150 570 100 C650 50 720 70 800 30 L800 250 L0 250Z" fill="url(#g)" opacity="0"/><path id="line" d="M0 210 C80 190 120 170 190 175 C270 180 300 120 380 115 C460 110 500 150 570 100 C650 50 720 70 800 30" fill="none" stroke="#780514" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" vector-effect="non-scaling-stroke"/></g><circle id="dot" r="9" fill="#780514" stroke="#FFF9EF" stroke-width="3" cx="0" cy="210"/></svg></div>
   <div class="card"><h3>Pipeline funnel</h3><div class="bars">${[['New', 100], ['Qualified', 72], ['Contacted', 55], ['Demo', 34], ['Won', 18]].map((b, i) => `<div class="bar"><em>${b[0]}</em><div id="b${i}" data-w="${b[1]}" style="width:0"></div></div>`).join('')}</div></div></div></div>
  <div class="scene" id="sc2"><div class="kan">${cols.map((c, ci) => `<div class="col"><div class="ch" style="background:${c[1]}">${c[0]}</div>${c[2].map((l, li) => `<div class="lc" id="lc${ci}${li}"><div class="im" style="background-image:url(${sl(l[0])})"></div><div class="tx"><b>${l[1]}</b><span>${l[2]}</span></div></div>`).join('')}</div>`).join('')}</div></div>
  <div class="scene" id="sc3"><div class="appr"><div class="mail"><div class="mh">Suvarna Heritage Jewellers</div><div class="mb"><p><b>To:</b> priya.mehta@example.com</p><p>Dear Priya,</p><p>Thank you for your enquiry about the Diamond Necklace. We would be delighted to invite you for a private viewing this weekend.</p><p>Warm regards,<br>Suvarna Heritage</p></div></div>
   <div class="card" style="text-align:center;position:relative"><h3>Approval</h3><div id="pend" style="margin:26px 0"><span class="stat" style="background:#FBE9C2;color:#7a5a17;border:1px solid #D9B15E">Pending review</span><p style="margin:22px 0;color:#705250;font-size:16px">Nothing is sent until you approve.</p><span class="btn" id="apbtn">Approve &amp; send</span></div><div id="done" style="opacity:0;position:absolute;left:0;right:0;top:90px"><div class="check" id="chk">✓</div><p style="margin-top:18px;font-weight:700;font-size:20px;color:#2f7a4d">Approved by you</p></div></div></div></div>
  <div id="cursor"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2 4 7-3 1-4-7-5 4z" fill="#fff" stroke="#351B1D" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
 </div></div>
<div id="outro">Techmunda · AI Jewellery Growth Studio · www.techmunda.co.in</div><div id="fine">Sample data for illustration. AI visuals are reviewed and approved by you before use.</div>
<script>
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)), ease=x=>1-Math.pow(1-clamp(x),3), $=id=>document.getElementById(id);
const win=(t,a,b,f=.5)=>clamp((t-a)/f)*clamp((b-t)/f);
const KV=${JSON.stringify(kpis.map((k) => k[1]))};
window.render=(t)=>{
  $('intro').style.opacity=win(t,-1,2.6,.6); $('intro').style.transform='translateY('+(1-ease(t/.8))*20+'px)';
  const wi=ease((t-.2)/1.0); $('win').style.opacity=wi; $('win').style.transform='translateY('+(1-wi)*180+'px) scale('+(0.94+0.06*wi+(t>11?0.02*clamp(t-11):0))+')';
  document.querySelectorAll('.nv').forEach((e,i)=>{e.style.opacity=ease((t-.9-i*.07)/.4);e.style.transform='translateX('+(1-ease((t-.9-i*.07)/.4))*-24+'px)'});
  const act=t<5.2?0:t<8.7?5:6; document.querySelectorAll('.nv').forEach((e,i)=>e.classList.toggle('on',i===act));
  $('ttl').textContent=t<5.2?'Good morning, Aarav':t<8.7?'Sales Pipeline':'Approvals';
  $('sub').textContent=t<5.2?'Here’s what’s happening with your jewellery business · last 30 days':t<8.7?'Drag a card between columns to update the lead and its opportunity.':'Nothing is published or sent until a person reviews it.';
  // S1
  $('sc1').style.opacity=win(t,1.6,5.2,.5);
  KV.forEach((v,i)=>{const p=ease((t-1.9-i*.18)/1.4);const e=$('k'+i);e.style.opacity=clamp((t-1.8-i*.18)/.4);e.style.transform='translateY('+(1-p)*30+'px)';$('kv'+i).textContent=v%1?(v*p).toFixed(1):Math.round(v*p)});
  const lp=ease((t-2.6)/1.8);$('line').style.strokeDashoffset=1-lp;$('area').style.opacity=lp;
  const L=$('line');const pt=L.getPointAtLength(L.getTotalLength()*lp);$('dot').setAttribute('cx',pt.x);$('dot').setAttribute('cy',pt.y*1.3);
  for(let i=0;i<5;i++){const b=$('b'+i);b.style.width=(ease((t-3-i*.15)/.9)*b.dataset.w*.62)+'%'}
  // S2
  $('sc2').style.opacity=win(t,5.2,8.7,.45);
  for(let c=0;c<4;c++)for(let l=0;l<2;l++){const s=5.5+c*.18+l*.35;const p=ease((t-s)/.6);const e=$('lc'+c+l);e.style.opacity=p;e.style.transform='translateY('+(1-p)*-60+'px)'}
  // S3
  $('sc3').style.opacity=clamp((t-8.7)/.45);
  const press=clamp((t-10.0)/.2)*clamp((10.4-t)/.2);$('apbtn').style.transform='scale('+(1-.08*press)+')';
  const ok=t>10.4;$('pend').style.opacity=ok?0:1;$('done').style.opacity=ok?ease((t-10.4)/.4):0;$('chk').style.transform='scale('+(0.4+0.6*ease((t-10.4)/.5))+')';
  // cursor
  const cur=$('cursor');let cx=900,cy=560,co=0;
  co=win(t,9.0,10.9,.2);
  cur.style.opacity=co;cur.style.left=(t>9?(300+ease((t-9.1)/.9)*880):0)+'px';cur.style.top=(t>9?(380+ease((t-9.1)/.9)*190):0)+'px';
  $('outro').style.opacity=clamp((t-11)/.5);
};
${loop ? `let s=null;function f(ts){if(s==null)s=ts;window.render(((ts-s)/1000)%12);requestAnimationFrame(f)}requestAnimationFrame(f);` : ''}
</script></body></html>`;

const out = path.join(here, 'out'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'dashboard-motion.html'), html(true));
const frames = path.join('/tmp/claude-0/-home-user/b3d5d689-1c35-5db8-a412-48d219d3f48b/scratchpad', 'dash-frames');
fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html(false)); await page.evaluate(() => document.fonts.ready);
for (let f = 0; f < FPS * DUR; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
}
for (const [name, t] of [['still-overview', 4.6], ['still-crm', 8.0], ['still-approval', 11.3]]) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ path: path.join(out, name + '.png') }); }
await page.evaluate(() => window.render(11.9)); await page.screenshot({ path: path.join(out, 'final-frame.png') });
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'dashboard-motion.mp4')]);
console.log('done');

// Renders the Instagram launch Reel (1080x1920, 18s, 24fps) frame by frame from brand assets, then encodes with ffmpeg.
// Run: node build-video.mjs   (needs ffmpeg + apps/web deps). Output: out/techmunda-launch-reel.mp4
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { chromium } = require('@playwright/test');
const b64 = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`;
const font = (pkg, file) => fs.readFileSync(path.join(web, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const img = (n) => b64(path.join(web, 'public/images/slides', n), 'image/jpeg');

const FPS = 24, DUR = 18, W = 1080, H = 1920;
const frames = path.join(process.env.FRAMES_DIR ?? '/tmp/claude-0/-home-user/b3d5d689-1c35-5db8-a412-48d219d3f48b/scratchpad', 'reel-frames');
fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
fs.mkdirSync(path.join(here, 'out'), { recursive: true });

const slides = ['bridal-model.jpg', 'emerald-necklace.jpg', 'jhumka-earrings.jpg', 'bridal-set.jpg', 'temple-bangles.jpg', 'solitaire-ring.jpg'].map(img);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Cormorant';font-weight:600;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:'Cormorant';font-weight:600;font-style:italic;src:url(data:font/woff2;base64,${font('cormorant-garamond', 'cormorant-garamond-latin-600-italic.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-500-normal.woff2')}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${font('inter', 'inter-latin-700-normal.woff2')}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#2e0a0e}
body{font-family:Inter,Arial,sans-serif;color:#F8EEDB;position:relative;background:radial-gradient(1400px 1100px at 20% 0%,#7a0f20 0%,#461318 50%,#2e0a0e 100%)}
.layer{position:absolute;inset:0;opacity:0}
.frame{position:absolute;inset:26px;border:2px solid rgba(184,138,54,.7);border-radius:30px;pointer-events:none}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px}
.emb{width:300px;height:300px;border-radius:50%;background:#FFF9EF;padding:10px;border:4px solid #B88A36;box-shadow:0 0 90px rgba(217,177,94,.45)}
.word{font-family:Cormorant,Georgia,serif;font-size:120px;font-weight:600;color:#FFF9EF;letter-spacing:2px;margin-top:40px}
.tag{font-size:26px;font-weight:700;letter-spacing:.34em;color:#D9B15E;margin-top:18px}
h1{font-family:Cormorant,Georgia,serif;font-weight:600;font-size:118px;line-height:1;color:#FFF9EF}
h1 em{color:#E3BF68}
.sub{font-size:40px;line-height:1.4;color:#E8D9BD;margin-top:34px;max-width:860px}
.arch{position:absolute;left:150px;top:330px;width:780px;height:1000px;border-radius:390px 390px 30px 30px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 40px 90px rgba(0,0,0,.55)}
.arch div{position:absolute;inset:-6%;background-size:cover;background-position:center}
.cap{position:absolute;left:90px;right:90px;top:1380px;text-align:center}
.cap b{display:block;font-family:Cormorant,Georgia,serif;font-size:84px;font-weight:600;line-height:1;color:#FFF9EF}
.cap span{display:block;margin-top:20px;font-size:38px;color:#E3BF68}
.shot{position:absolute;left:70px;top:700px;width:940px;border-radius:26px;overflow:hidden;border:4px solid #D9B15E;box-shadow:0 40px 90px rgba(0,0,0,.6);background:#F8EEDB}
.shot img{display:block;width:100%}
.step{position:absolute;left:90px;right:90px;top:290px;text-align:center}
.step i{font-style:normal;font-size:30px;font-weight:700;letter-spacing:.3em;color:#D9B15E}
.step b{display:block;margin-top:14px;font-family:Cormorant,Georgia,serif;font-size:92px;font-weight:600;line-height:1;color:#FFF9EF}
.btn{display:inline-block;margin-top:56px;background:linear-gradient(180deg,#F1D58E,#C99A42);color:#3a0b12;font-weight:700;font-size:52px;padding:34px 80px;border-radius:999px;box-shadow:0 18px 40px rgba(0,0,0,.45)}
.url{margin-top:44px;font-size:42px;font-weight:700;color:#FFF9EF}
.fine{position:absolute;left:0;right:0;top:1560px;text-align:center;font-size:24px;color:#BFA982;padding:0 90px}
</style></head><body><div class="frame"></div>
<div class="layer center" id="s1"><img class="emb" id="emb" src="${b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png')}"><div class="word" id="word">Techmunda</div><div class="tag" id="tag">AI JEWELLERY GROWTH STUDIO</div></div>
<div class="layer center" id="s2"><h1 id="h2a">Your jewellery<br>is stunning.</h1><h1 id="h2b" style="margin-top:46px"><em>Is your<br>marketing?</em></h1></div>
<div class="layer" id="s3"><div class="step"><i>01 · PRODUCT VISUALS</i></div><div class="arch" id="arch">${slides.map((s, i) => `<div style="background-image:url(${s});opacity:${i ? 0 : 1}"></div>`).join('')}</div><div class="cap"><b>Show it beautifully.</b><span>You approve every image</span></div></div>
<div class="layer" id="s4"><div class="step"><i>02 · LEADS &amp; CRM</i><b>Capture. Qualify.<br>Follow up.</b></div><div class="shot" id="shot4"><img src="${b64(path.join(here, 'assets/app-crm.png'), 'image/png')}"></div><div class="cap" style="top:1330px"><span style="color:#F8EEDB;font-size:42px;margin:0">Kanban CRM with your real product photos</span></div></div>
<div class="layer" id="s5"><div class="step"><i>03 · YOU STAY IN CONTROL</i><b>Nothing is sent<br>without your OK.</b></div><div class="shot" id="shot5"><img src="${b64(path.join(here, 'assets/app-approvals.png'), 'image/png')}"></div><div class="cap" style="top:1330px"><span style="color:#F8EEDB;font-size:42px;margin:0">Approve-then-send e-mail drafts</span></div></div>
<div class="layer center" id="s6"><img class="emb" id="emb6" style="width:220px;height:220px" src="${b64(path.join(web, 'public/images/logo-emblem.png'), 'image/png')}"><h1 style="margin-top:50px;font-size:104px">Launching <em>now.</em></h1><div class="sub">Product visuals, lead capture, CRM &amp; follow-ups for jewellers in India &amp; Dubai.</div><div class="btn" id="btn">Book a free demo</div><div class="url">www.techmunda.co.in</div></div>
<div class="fine" id="fine">Screens show sample data. AI visuals are reviewed &amp; approved by you before use.</div>
<script>
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
// opacity window with fade in/out
const win=(t,a,b,f=0.5)=>clamp((t-a)/f)*clamp((b-t)/f);
const $=id=>document.getElementById(id);
const set=(id,o,ty=0,sc=1)=>{const e=$(id);e.style.opacity=o;e.style.transform='translateY('+ty+'px) scale('+sc+')'};
window.render=(t)=>{
  // S1 0-3
  set('s1',win(t,-1,3,.5)); set('emb',1,0,0.6+0.4*ease(t/1.2)); set('word',ease((t-0.6)/0.8),(1-ease((t-0.6)/0.8))*30); set('tag',ease((t-1.3)/0.8));
  // S2 3-6
  set('s2',win(t,3,6,.5)); set('h2a',ease((t-3.2)/.7),(1-ease((t-3.2)/.7))*40); set('h2b',ease((t-4.1)/.7),(1-ease((t-4.1)/.7))*40);
  // S3 6-9.6 slideshow
  set('s3',win(t,6,9.6,.5));
  const k=clamp((t-6)/3.6), n=${slides.length}, pos=k*(n-0.01); const kids=$('arch').children;
  for(let i=0;i<n;i++){const d=Math.abs(pos-i); kids[i].style.opacity=clamp(1.5-d*1.5)||0; kids[i].style.transform='scale('+(1.05+0.06*(pos-i+0.5))+')'}
  // S4 9.6-13
  set('s4',win(t,9.6,13,.5)); set('shot4',1,(1-ease((t-9.8)/.9))*140,1+0.04*clamp((t-9.8)/3));
  // S5 13-16
  set('s5',win(t,13,16,.5)); set('shot5',1,(1-ease((t-13.2)/.9))*140,1+0.04*clamp((t-13.2)/3));
  // S6 16-18
  set('s6',clamp((t-16)/.5)); set('emb6',1,0,0.8+0.2*ease((t-16)/.7)); set('btn',1,0,1+0.04*Math.sin((t-16.6)*6)*clamp((t-16.6)/.3));
  $('fine').style.opacity=t>9.6?0.8:0;
};
</script></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const total = FPS * DUR;
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
}
await browser.close();
const out = path.join(here, 'out/techmunda-launch-reel.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out]);
console.log('wrote', out);

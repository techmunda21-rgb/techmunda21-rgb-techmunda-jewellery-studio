/**
 * Builds a designed PDF price catalogue + a matching CSV (importable via Products → Import CSV) for one tenant.
 * Run:  pnpm --filter @techmunda/database exec tsx ../../infrastructure/scripts/build-catalogue.ts <tenant-slug> [out-dir]
 * Every number printed (purity, grams, pure-metal content, price) is read from the catalogue record. Nothing is estimated from photos.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { createStorage, loadEnv } from '@techmunda/core';
import { parsePurity, pureMetalGrams } from '@techmunda/shared';

const require = createRequire(path.resolve(__dirname, '../../apps/web/package.json'));
const { chromium } = require('@playwright/test');

const slug = process.argv[2] ?? 'suvarna-heritage';
const outDir = path.resolve(process.argv[3] ?? path.resolve(__dirname, '../../docs/catalogue'));
const prisma = new PrismaClient();
const env = loadEnv();
const storage = createStorage(env);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (n: number | null, cur: string) => (n == null ? 'On request' : `${cur === 'INR' ? '₹' : cur + ' '}${new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(n)}`);

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
  const products = await prisma.product.findMany({ where: { tenantId: tenant.id }, orderBy: [{ category: 'asc' }, { createdAt: 'asc' }], include: { media: { where: { mediaKind: 'PHOTO', isOriginal: true }, orderBy: { createdAt: 'asc' }, take: 1 } } });
  const items = await Promise.all(products.map(async (p) => {
    const m = p.media[0];
    const img = m ? `data:${m.mimeType};base64,${(await storage.get(m.storageKey)).toString('base64')}` : null;
    const w = p.weight != null ? Number(p.weight) : null;
    const info = parsePurity(p.metalType, p.purity);
    return { p, img, w, info, pure: pureMetalGrams(w, info?.fineness), price: p.price != null ? Number(p.price) : null };
  }));

  const cssFonts = '';  // system serif/sans fallbacks keep the script dependency-free; Playwright's Chromium ships suitable fonts
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const hero = items.find((i) => i.img)?.img;

  const page = (i: (typeof items)[number], n: number) => {
    const alloy = i.w != null && i.pure != null ? Math.round((i.w - i.pure) * 1000) / 1000 : null;
    const pct = i.w && i.pure ? Math.round((i.pure / i.w) * 1000) / 10 : null;
    return `<section class="pg product">
      <header><span>${esc(tenant.name)}</span><span>${esc(i.p.category)}</span></header>
      <div class="grid">
        <figure>${i.img ? `<img src="${i.img}" alt="">` : '<div class="noimg">Photograph pending</div>'}<figcaption>Concept imagery — see notes</figcaption></figure>
        <div class="info">
          <p class="sku">SKU ${esc(i.p.sku)}</p>
          <h2>${esc(i.p.name)}</h2>
          ${i.p.description ? `<p class="desc">${esc(i.p.description)}</p>` : ''}
          <div class="price"><small>Price</small>${inr(i.price, i.p.currency)}</div>
          <table class="spec">
            <tr><th>Metal</th><td>${esc(i.p.metalType ?? '—')}</td></tr>
            <tr><th>Purity (hallmark)</th><td>${i.info ? `${esc(i.info.label)} &middot; ${i.info.fineness} fineness` : esc(i.p.purity ?? '—')}</td></tr>
            <tr><th>Gross weight</th><td>${i.w != null ? `${i.w} g` : '—'}</td></tr>
            <tr><th>Pure metal content</th><td>${i.pure != null ? `${i.pure} g` : '—'}</td></tr>
            <tr><th>Stones</th><td>${esc(i.p.stoneType ?? '—')}</td></tr>
            <tr><th>Availability</th><td class="cap">${esc(i.p.availability.replace(/_/g, ' ').toLowerCase())}</td></tr>
          </table>
          ${i.w != null && i.pure != null ? `<div class="struct"><p class="lbl">Weight structure</p>
            <div class="bar"><span style="width:${pct}%"></span></div>
            <div class="legend"><span><i class="g"></i>Pure ${esc(i.p.metalType ?? 'metal')} ${i.pure} g (${pct}%)</span><span><i class="a"></i>Alloy &amp; other material (incl. stones) ${alloy} g</span></div></div>` : ''}
        </div>
      </div>
      <footer><span>Purity and weight are catalogue records; verify against the hallmark certificate and invoice.</span><span>${n}</span></footer>
    </section>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${cssFonts}
  @page{size:A4;margin:0}
  :root{--royal:#780514;--gold:#B88A36;--gold-deep:#8A641E;--cream:#F8EEDB;--ivory:#FFF9EF;--maroon:#461318;--ink:#351B1D;--muted:#705250}
  *{box-sizing:border-box;margin:0;padding:0} body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:var(--ink);background:var(--cream);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .serif{font-family:'Playfair Display',Georgia,'Times New Roman',serif}
  .pg{width:210mm;height:296.5mm;page-break-after:always;position:relative;overflow:hidden}.pg:last-child{page-break-after:auto}
  .cover{background:var(--maroon);color:var(--cream);display:flex;flex-direction:column}
  .cover .photo{height:58%;background:#2d0a0e center/cover no-repeat;border-bottom:4px solid var(--gold);position:relative}
  .cover .photo:after{content:'';position:absolute;inset:0;background:linear-gradient(to top,var(--maroon),transparent 45%)}
  .cover .txt{padding:14mm 18mm;flex:1;display:flex;flex-direction:column;justify-content:center}
  .eyebrow{font-size:9pt;letter-spacing:.32em;text-transform:uppercase;color:var(--gold)}
  .cover h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:48pt;line-height:1.02;margin:6mm 0 4mm;color:#FFF9EF}
  .cover p{font-size:11pt;color:#E8D9BD;max-width:120mm;line-height:1.6}
  .rule{height:1px;background:linear-gradient(to right,var(--gold),transparent);margin:7mm 0;width:60mm}
  .index{padding:18mm;background:var(--ivory)} .index h2{font-family:Georgia,serif;font-size:24pt;color:var(--maroon);margin:3mm 0 8mm}
  table.idx{width:100%;border-collapse:collapse;font-size:9.5pt} .idx th{text-align:left;font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep);border-bottom:1.5px solid var(--gold);padding:2.5mm 2mm}
  .idx td{padding:3mm 2mm;border-bottom:1px solid #e6d5b0} .idx td.n{text-align:right;font-variant-numeric:tabular-nums} .idx tr td:first-child{font-weight:600}
  .product{background:var(--ivory);padding:14mm 16mm;display:flex;flex-direction:column}
  .product header,.product footer{display:flex;justify-content:space-between;font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-deep)}
  .product header{padding-bottom:4mm;border-bottom:1px solid var(--gold)} .product footer{margin-top:auto;padding-top:4mm;border-top:1px solid #e6d5b0;letter-spacing:.02em;text-transform:none;color:var(--muted);font-size:7.5pt}
  .grid{display:flex;flex-direction:column;gap:9mm;padding-top:8mm}
  figure{position:relative;border:1px solid var(--gold);border-radius:4mm;overflow:hidden;background:var(--maroon);height:112mm} figure img{width:100%;height:100%;object-fit:cover}
  figcaption{position:absolute;right:3mm;bottom:2.5mm;font-size:6.5pt;color:#F8EEDB;background:rgba(46,10,14,.7);padding:1mm 2.5mm;border-radius:2mm}
  .noimg{height:100%;display:flex;align-items:center;justify-content:center;color:var(--gold)}
  .sku{font-size:8.5pt;letter-spacing:.2em;color:var(--gold-deep);text-transform:uppercase} .info h2{font-family:Georgia,serif;font-size:27pt;line-height:1.15;color:var(--maroon);margin:2mm 0}
  .desc{font-size:10pt;color:var(--muted);margin-bottom:3mm}
  .price{display:inline-block;background:var(--royal);color:#FFF9EF;font-family:Georgia,serif;font-size:21pt;padding:3mm 7mm;border-radius:2.5mm;border:1px solid var(--gold);margin:3mm 0 6mm} .price small{display:block;font-family:Inter,Arial,sans-serif;font-size:7pt;letter-spacing:.24em;text-transform:uppercase;color:#EAD7AE;margin-bottom:1mm}
  table.spec{width:100%;border-collapse:collapse;font-size:10.5pt} .spec th{width:42%;text-align:left;font-weight:500;color:var(--muted);padding:2.4mm 0;border-bottom:1px solid #e6d5b0} .spec td{padding:2.4mm 0;border-bottom:1px solid #e6d5b0;font-weight:600}.spec td.cap{text-transform:capitalize}
  .struct{margin-top:6mm} .lbl{font-size:7.5pt;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:2mm}
  .bar{height:5mm;background:#d9c7a0;border-radius:3mm;overflow:hidden;border:1px solid var(--gold)} .bar span{display:block;height:100%;background:linear-gradient(90deg,#8A641E,#E3BF68,#B88A36)}
  .legend{display:flex;justify-content:space-between;gap:6mm;font-size:8.5pt;margin-top:2mm;color:var(--ink)} .legend i{display:inline-block;width:3mm;height:3mm;border-radius:50%;margin-right:1.5mm;vertical-align:-.5mm} i.g{background:#B88A36} i.a{background:#d9c7a0;border:1px solid var(--gold)}
  .notes{padding:18mm;background:var(--ivory);font-size:9.5pt;line-height:1.7} .notes h2{font-family:Georgia,serif;font-size:22pt;color:var(--maroon);margin-bottom:6mm} .notes li{margin:0 0 3mm 5mm}
  </style></head><body>
  <section class="pg cover"><div class="photo" style="${hero ? `background-image:url(${hero})` : ''}"></div>
    <div class="txt"><p class="eyebrow">Price Catalogue · ${esc(date)}</p><h1>${esc(tenant.name)}</h1><div class="rule"></div><p>${products.length} designs with hallmark purity, gross weight, pure-metal content and prices.</p></div></section>
  <section class="pg index"><p class="eyebrow">Contents</p><h2>At a glance</h2>
    <table class="idx"><thead><tr><th>Design</th><th>SKU</th><th>Purity</th><th class="n">Gross g</th><th class="n">Pure g</th><th class="n">Price</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${esc(i.p.name)}</td><td>${esc(i.p.sku)}</td><td>${i.info ? `${esc(i.info.label)} · ${i.info.fineness}` : esc(i.p.purity ?? '—')}</td><td class="n">${i.w ?? '—'}</td><td class="n">${i.pure ?? '—'}</td><td class="n">${inr(i.price, i.p.currency)}</td></tr>`).join('')}
    </tbody></table></section>
  ${items.map((i, k) => page(i, k + 3)).join('\n')}
  <section class="pg notes"><p class="eyebrow">Notes</p><h2>Reading this catalogue</h2><ul>
    <li><strong>Purity</strong> is the hallmark standard recorded for each piece (e.g. 22K = 916 fineness).</li>
    <li><strong>Gross weight</strong> is the recorded weight of the finished piece, including any stones.</li>
    <li><strong>Pure metal content</strong> = gross weight × fineness ÷ 1000. Stone weight is not deducted, so it is an upper bound on the pure metal.</li>
    <li><strong>Prices</strong> are the amounts entered in the catalogue; confirm taxes, making charges and today’s metal rate before quoting.</li>
    <li><strong>Imagery</strong> in this sample is concept imagery used as a placeholder. Production catalogues must use photographs of the actual piece that the business is authorised to use.</li>
    <li>Prepared ${esc(date)} from the live catalogue. Re-import the matching CSV into the software to keep both in sync.</li></ul></section>
  </body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome'].find((p) => fs.existsSync(p)), args: ['--no-sandbox'] });
  const pg = await browser.newPage();
  await pg.setContent(html, { waitUntil: 'load' });
  const pdfPath = path.join(outDir, `${slug}-catalogue.pdf`);
  await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();

  const q = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = ['sku,name,category,metal,purity,stones,weight_g,price,currency,availability,description', ...products.map((p) => [p.sku, p.name, p.category, p.metalType, p.purity, p.stoneType, p.weight, p.price, p.currency, p.availability, p.description].map(q).join(','))].join('\n') + '\n';
  const csvPath = path.join(outDir, `${slug}-catalogue.csv`);
  fs.writeFileSync(csvPath, csv);
  console.log(`PDF: ${pdfPath}\nCSV: ${csvPath}\n${products.length} products`);
}
main().finally(() => prisma.$disconnect());

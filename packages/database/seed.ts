/**
 * Repeatable demo seed. Wipes and recreates the demo tenants (matched by slug).
 * All people, e-mails and phone numbers are synthetic. Product images are synthetic SVG illustrations
 * rendered locally — NOT photographs of real jewellery. Replace them with client-authorised photos.
 * Nothing here sends any message.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaClient, type LeadStage } from '@prisma/client';
import { buildCreativeBrief, createStorage, loadEnv, processCreativeJob, sha256, simulatedDraft } from '@techmunda/core';

const prisma = new PrismaClient();
const env = loadEnv({ ...process.env, AI_MODE: 'simulated' } as NodeJS.ProcessEnv); // seed never calls external AI
const storage = createStorage(env);
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@12345';

const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D58A"/><stop offset="0.5" stop-color="#C9983F"/><stop offset="1" stop-color="#8F6420"/></linearGradient>`;
const frame = (inner: string, bg1 = '#7A0F20', bg2 = '#2D0A10') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><defs>${GOLD}
  <radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
  <radialGradient id="ruby"><stop offset="0" stop-color="#FF6A7A"/><stop offset="1" stop-color="#8A0B1E"/></radialGradient>
  <radialGradient id="emerald"><stop offset="0" stop-color="#6EE7A8"/><stop offset="1" stop-color="#0B5A36"/></radialGradient>
  <radialGradient id="diamond"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#BFD6E8"/></radialGradient>
  <radialGradient id="pearl"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4D8C3"/></radialGradient></defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>${inner}
  <text x="600" y="1160" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#F3D58A" fill-opacity="0.65" letter-spacing="3">SYNTHETIC ILLUSTRATION · NOT A PRODUCT PHOTO</text></svg>`;

const dots = (n: number, fx: (t: number) => [number, number], r: (t: number) => number, fill: string) =>
  Array.from({ length: n }, (_, i) => { const t = i / (n - 1); const [x, y] = fx(t); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r(t).toFixed(1)}" fill="${fill}" stroke="#6B4A14" stroke-width="2"/>`; }).join('');

const ART: Record<string, string> = {
  necklace: frame(`
    <path d="M230 260 Q600 900 970 260" fill="none" stroke="url(#gold)" stroke-width="14"/>
    ${dots(15, (t) => [250 + t * 700, 280 + Math.sin(t * Math.PI) * 520], (t) => 30 + Math.sin(t * Math.PI) * 14, 'url(#gold)')}
    ${dots(5, (t) => [420 + t * 360, 560 + Math.sin(t * Math.PI) * 150], () => 20, 'url(#ruby)')}
    <path d="M600 760 L660 860 L600 990 L540 860 Z" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/><circle cx="600" cy="865" r="34" fill="url(#ruby)" stroke="#6B4A14" stroke-width="3"/>`),
  bangles: frame(`
    ${[0, 1, 2, 3].map((i) => `<ellipse cx="${470 + i * 90}" cy="600" rx="${230 - i * 6}" ry="${300 - i * 6}" fill="none" stroke="url(#gold)" stroke-width="34"/><ellipse cx="${470 + i * 90}" cy="600" rx="${230 - i * 6}" ry="${300 - i * 6}" fill="none" stroke="#FFE9A8" stroke-opacity=".35" stroke-width="6" stroke-dasharray="3 22"/>`).join('')}`, '#4A0A15', '#1C0508'),
  ring: frame(`
    <ellipse cx="600" cy="700" rx="230" ry="250" fill="none" stroke="url(#gold)" stroke-width="46"/>
    <path d="M470 470 L730 470 L690 380 L510 380 Z" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/>
    <polygon points="600,250 700,380 600,470 500,380" fill="url(#diamond)" stroke="#8FA9BF" stroke-width="3"/>
    <polygon points="600,250 650,380 600,470" fill="#fff" fill-opacity=".45"/>`, '#2C2C2C', '#0B0B0B'),
  earrings: frame(`
    ${[360, 840].map((x) => `<circle cx="${x}" cy="330" r="46" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/>
    <path d="M${x} 376 L${x - 120} 640 Q${x} 760 ${x + 120} 640 Z" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/>
    <circle cx="${x}" cy="580" r="52" fill="url(#emerald)" stroke="#6B4A14" stroke-width="3"/>
    ${dots(5, (t) => [x - 100 + t * 200, 720 + Math.sin(t * Math.PI) * 70], () => 18, 'url(#pearl)')}
    ${dots(5, (t) => [x - 100 + t * 200, 800 + Math.sin(t * Math.PI) * 70], () => 14, 'url(#gold)')}`).join('')}`, '#0E4B3A', '#04201A'),
  bridal: frame(`
    <path d="M180 220 Q600 1020 1020 220" fill="none" stroke="url(#gold)" stroke-width="18"/>
    <path d="M300 260 Q600 800 900 260" fill="none" stroke="url(#gold)" stroke-width="12"/>
    ${dots(13, (t) => [210 + t * 780, 250 + Math.sin(t * Math.PI) * 600], (t) => 26 + Math.sin(t * Math.PI) * 16, 'url(#ruby)')}
    ${dots(11, (t) => [320 + t * 560, 300 + Math.sin(t * Math.PI) * 430], () => 22, 'url(#gold)')}
    <path d="M600 880 L700 800 L740 910 L600 1060 L460 910 L500 800 Z" fill="url(#gold)" stroke="#6B4A14" stroke-width="4"/><circle cx="600" cy="905" r="48" fill="url(#emerald)" stroke="#6B4A14" stroke-width="3"/>`),
  mangalsutra: frame(`
    <path d="M300 200 Q600 760 900 200" fill="none" stroke="url(#gold)" stroke-width="10"/>
    ${dots(40, (t) => [320 + t * 560, 230 + Math.sin(t * Math.PI) * 480], () => 11, '#111')}
    <circle cx="600" cy="800" r="70" fill="url(#gold)" stroke="#6B4A14" stroke-width="4"/><circle cx="600" cy="800" r="32" fill="url(#diamond)" stroke="#8FA9BF" stroke-width="2"/>`, '#5A1A12', '#240A06'),
  pearl: frame(`
    ${dots(18, (t) => [230 + t * 740, 260 + Math.sin(t * Math.PI) * 560], (t) => 28 + Math.sin(t * Math.PI) * 12, 'url(#pearl)')}
    <circle cx="600" cy="860" r="60" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/><circle cx="600" cy="860" r="28" fill="url(#ruby)"/>`, '#3B1D3F', '#150817'),
  temple: frame(`
    <path d="M200 220 Q600 760 1000 220" fill="none" stroke="url(#gold)" stroke-width="16"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${300 + i * 100} ${300 + Math.sin(i / 6 * Math.PI) * 300} l34 70 l-34 70 l-34 -70 z" fill="url(#gold)" stroke="#6B4A14" stroke-width="3"/><circle cx="${300 + i * 100}" cy="${370 + Math.sin(i / 6 * Math.PI) * 300}" r="14" fill="url(#ruby)"/>`).join('')}
    <path d="M600 820 L680 940 L600 1070 L520 940 Z" fill="url(#gold)" stroke="#6B4A14" stroke-width="4"/>`, '#6A1B0C', '#2A0A04'),
};

const PRODUCTS = [
  { sku: 'DN-001', name: 'Diamond Necklace', category: 'Necklace', art: 'necklace', metalType: 'Gold', purity: '22K', stoneType: 'Diamond', weight: 48.5, price: 1250000, availability: 'IN_STOCK' },
  { sku: 'GB-002', name: 'Gold Bangles (Set of 4)', category: 'Bangles', art: 'bangles', metalType: 'Gold', purity: '22K', stoneType: null, weight: 62.0, price: 216000, availability: 'IN_STOCK' },
  { sku: 'BS-003', name: 'Bridal Set', category: 'Bridal Set', art: 'bridal', metalType: 'Gold', purity: '22K', stoneType: 'Ruby, Emerald', weight: 120.0, price: 1890000, availability: 'MADE_TO_ORDER' },
  { sku: 'ER-004', name: 'Emerald Earrings', category: 'Earrings', art: 'earrings', metalType: 'Gold', purity: '18K', stoneType: 'Emerald, Pearl', weight: 14.2, price: 475000, availability: 'IN_STOCK' },
  { sku: 'PN-005', name: 'Polki Necklace', category: 'Necklace', art: 'temple', metalType: 'Gold', purity: '22K', stoneType: 'Polki', weight: 55.0, price: 840000, availability: 'IN_STOCK' },
  { sku: 'TJ-006', name: 'Temple Jewellery Haar', category: 'Necklace', art: 'temple', metalType: 'Gold', purity: '22K', stoneType: 'Ruby', weight: 70.3, price: 695000, availability: 'MADE_TO_ORDER' },
  { sku: 'DR-007', name: 'Diamond Solitaire Ring', category: 'Ring', art: 'ring', metalType: 'Platinum', purity: '950', stoneType: 'Diamond', weight: 6.1, price: 325000, availability: 'IN_STOCK' },
  { sku: 'PS-008', name: 'Pearl Set', category: 'Necklace', art: 'pearl', metalType: 'Gold', purity: '18K', stoneType: 'Pearl', weight: 38.0, price: 560000, availability: 'IN_STOCK' },
  { sku: 'MS-009', name: 'Diamond Mangalsutra', category: 'Mangalsutra', art: 'mangalsutra', metalType: 'Gold', purity: '22K', stoneType: 'Diamond', weight: 18.4, price: 210000, availability: 'IN_STOCK' },
];

const monthsAgo = (m: number, day = 10) => { const d = new Date(); d.setMonth(d.getMonth() - m, day); return d; };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

async function wipe() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ['suvarna-heritage', 'al-noor-dubai', 'techmunda-platform'] } } });
}

async function main() {
  await wipe();
  const hash = await bcrypt.hash(PASSWORD, 12);

  const platform = await prisma.tenant.create({ data: { name: 'Techmunda Platform', slug: 'techmunda-platform', country: 'IN' } });
  await prisma.user.create({ data: { tenantId: platform.id, fullName: 'Techmunda Admin', email: 'admin@techmunda.demo', passwordHash: hash, role: 'PLATFORM_ADMIN' } });

  const t = await prisma.tenant.create({ data: { name: 'Suvarna Heritage Jewellers', slug: 'suvarna-heritage', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata' } });
  const mk = (fullName: string, email: string, role: any) => prisma.user.create({ data: { tenantId: t.id, fullName, email, passwordHash: hash, role } });
  const owner = await mk('Aarav Sharma', 'owner@suvarna.demo', 'TENANT_OWNER');
  const manager = await mk('Meera Iyer', 'manager@suvarna.demo', 'MANAGER');
  const designer = await mk('Kabir Nair', 'designer@suvarna.demo', 'DESIGNER');
  const sales1 = await mk('Ishita Rao', 'sales@suvarna.demo', 'SALES_EXECUTIVE');
  const sales2 = await mk('Devansh Malhotra', 'sales2@suvarna.demo', 'SALES_EXECUTIVE');
  await mk('Naina Kapoor', 'viewer@suvarna.demo', 'VIEWER');

  // second tenant → demonstrates tenant isolation
  const b = await prisma.tenant.create({ data: { name: 'Al Noor Fine Jewellery', slug: 'al-noor-dubai', country: 'AE', currency: 'AED', timezone: 'Asia/Dubai' } });
  const bOwner = await prisma.user.create({ data: { tenantId: b.id, fullName: 'Layla Haddad', email: 'owner@alnoor.demo', passwordHash: hash, role: 'TENANT_OWNER' } });
  const bProd = await prisma.product.create({ data: { tenantId: b.id, sku: 'AN-001', name: 'Arabesque Gold Choker', category: 'Necklace', metalType: 'Gold', purity: '21K', price: 18500, currency: 'AED' } });
  const bContact = await prisma.contact.create({ data: { tenantId: b.id, name: 'Omar Farouk', email: 'omar.f@example.com', phone: '+971 50 000 1122', consentStatus: 'GRANTED', consentSource: 'seed', consentTimestamp: new Date() } });
  await prisma.lead.create({ data: { tenantId: b.id, contactId: bContact.id, source: 'website_enquiry', productInterest: 'Gold Choker', status: 'NEW', assignedTo: bOwner.id } });
  void bProd;

  // products + synthetic images
  const products: Record<string, { id: string; mediaId: string }> = {};
  for (const p of PRODUCTS) {
    const prod = await prisma.product.create({ data: { tenantId: t.id, sku: p.sku, name: p.name, category: p.category, description: `${p.name} — catalogue entry (demo data).`, metalType: p.metalType, purity: p.purity, stoneType: p.stoneType, weight: p.weight, price: p.price, availability: p.availability as any } });
    const png = await sharp(Buffer.from(ART[p.art])).png().toBuffer();
    const key = `${t.id}/originals/${randomUUID()}.png`;
    await storage.put(key, png, 'image/png');
    const m = await prisma.productMedia.create({ data: { tenantId: t.id, productId: prod.id, storageKey: key, mimeType: 'image/png', fileSize: png.length, checksum: sha256(png), width: 1200, height: 1200, isOriginal: true, rightsConfirmed: true, uploadedBy: designer.id } });
    products[p.sku] = { id: prod.id, mediaId: m.id };
  }

  // leads across the pipeline (all synthetic)
  type L = { name: string; email?: string; phone?: string; interest: string; bMin?: number; bMax?: number; timeline?: string; stage: LeadStage; score: number; rep: typeof sales1; consent?: 'GRANTED' | 'NOT_GRANTED' | 'WITHDRAWN'; msg: string; ago: number; intent: string; appt?: boolean; source?: string; followUpInDays?: number; value?: number };
  const L: L[] = [
    { name: 'Priya Mehta', email: 'priya.mehta@example.com', phone: '+91 98765 43210', interest: 'Diamond Necklace', bMin: 1000000, bMax: 1500000, timeline: 'December 2026', stage: 'QUALIFIED', score: 86, rep: sales1, msg: 'I am looking for a diamond necklace for my wedding in December. Budget around 10-15 lakhs. Would like to see some designs and book an appointment next week.', ago: 0, intent: 'purchase', appt: true, followUpInDays: 0, value: 1250000 },
    { name: 'Rohit Kapoor', email: 'rohit.kapoor@example.com', phone: '+91 98111 22334', interest: 'Diamond Ring', bMin: 200000, bMax: 300000, timeline: 'Within 1 month', stage: 'NEW', score: 0, rep: sales2, msg: 'Looking for an engagement ring, solitaire, around 2-3 lakh. Need it within a month.', ago: 0, intent: 'purchase', followUpInDays: 0, value: 250000 },
    { name: 'Neha Singh', email: 'neha.singh@example.com', interest: 'Gold Necklace', bMin: 100000, bMax: 100000, stage: 'NEW', score: 0, rep: sales1, msg: 'Hi, do you have light gold necklaces around 1 lakh?', ago: 0, intent: 'research', value: 100000 },
    { name: 'Amit Verma', email: 'amit.verma@example.com', interest: 'Earrings', bMin: 50000, bMax: 100000, stage: 'NEW', score: 0, rep: sales2, msg: 'Interested in emerald earrings for an anniversary gift. Budget 50k to 1 lakh.', ago: 1, intent: 'purchase', value: 75000 },
    { name: 'Sneha Jain', email: 'sneha.jain@example.com', phone: '+91 99880 11223', interest: 'Wedding Collection', bMin: 500000, bMax: 1000000, timeline: '3-6 months', stage: 'APPOINTMENT', score: 78, rep: sales1, msg: 'Planning my wedding in 4 months, want to see bridal sets. Can we visit the showroom this weekend?', ago: 3, intent: 'appointment', appt: true, followUpInDays: 1, value: 750000 },
    { name: 'Ananya Gupta', email: 'ananya.gupta@example.com', interest: 'Custom Design', bMin: 1000000, bMax: 1500000, timeline: '1-3 months', stage: 'APPOINTMENT', score: 74, rep: sales2, msg: 'I want a custom temple jewellery haar. Budget 10-15 lakh.', ago: 6, intent: 'appointment', appt: true, followUpInDays: 2, value: 1250000 },
    { name: 'Vikram Patel', email: 'vikram.patel@example.com', phone: '+91 97000 45454', interest: 'Engagement Ring', bMin: 500000, bMax: 600000, timeline: 'Within 1 month', stage: 'PROPOSAL', score: 82, rep: sales1, msg: 'Shortlisted two solitaires, please share a proposal.', ago: 9, intent: 'purchase', followUpInDays: 1, value: 550000 },
    { name: 'Rhea Kapoor', email: 'rhea.kapoor@example.com', interest: 'Bridal Collection', bMin: 1500000, bMax: 2500000, timeline: '1-3 months', stage: 'PROPOSAL', score: 88, rep: sales2, msg: 'Need a full bridal set including necklace, earrings and bangles.', ago: 11, intent: 'purchase', value: 2000000 },
    { name: 'Karan Shah', email: 'karan.shah@example.com', interest: 'Custom Design', bMin: 800000, bMax: 1500000, stage: 'NEGOTIATION', score: 71, rep: sales1, msg: 'Discussing a custom gold necklace; can we finalise the weight and rate?', ago: 14, intent: 'purchase', value: 1150000 },
    { name: 'Diya Menon', email: 'diya.menon@example.com', interest: 'Mangalsutra', bMin: 150000, bMax: 250000, timeline: 'Within 1 month', stage: 'CONTACTED', score: 69, rep: sales2, msg: 'Looking for a diamond mangalsutra for our anniversary.', ago: 5, intent: 'purchase', value: 200000 },
    { name: 'Arjun Reddy', email: 'arjun.reddy@example.com', interest: 'Gold Bangles', bMin: 200000, bMax: 250000, stage: 'WON', score: 80, rep: sales1, msg: 'Purchased gold bangles set.', ago: 25, intent: 'purchase', value: 216000 },
    { name: 'Tara Bose', email: 'tara.bose@example.com', interest: 'Pearl Set', bMin: 500000, bMax: 600000, stage: 'WON', score: 77, rep: sales2, msg: 'Purchased pearl set.', ago: 55, intent: 'purchase', value: 560000 },
    { name: 'Samar Khanna', email: 'samar.khanna@example.com', interest: 'Polki Necklace', bMin: 800000, bMax: 900000, stage: 'WON', score: 84, rep: sales1, msg: 'Purchased Polki necklace.', ago: 85, intent: 'purchase', value: 840000 },
    { name: 'Isha Pillai', email: 'isha.pillai@example.com', interest: 'Earrings', stage: 'LOST', score: 35, rep: sales2, msg: 'Went with another jeweller.', ago: 40, intent: 'research', value: 60000 },
    { name: 'Kavya Nair', email: 'kavya.nair@example.com', interest: 'Earrings', bMin: 80000, bMax: 120000, stage: 'LOST', score: 52, rep: sales1, msg: 'Comparing options.', ago: 33, intent: 'research', value: 100000 },
    { name: 'Rahul Bansal', email: 'rahul.bansal@example.com', interest: 'Ring', bMin: 150000, bMax: 200000, stage: 'CONTACTED', score: 61, rep: sales2, msg: 'Anniversary ring.', ago: 36, intent: 'purchase', value: 175000 },
    { name: 'Simran Arora', email: 'simran.arora@example.com', interest: 'Bridal Set', bMin: 1000000, bMax: 1800000, stage: 'PROPOSAL', score: 79, rep: sales1, msg: 'Bridal set for February.', ago: 41, intent: 'purchase', value: 1400000 },
    { name: 'Dev Chopra', email: 'dev.chopra@example.com', interest: 'Gold Chain', bMin: 90000, bMax: 120000, stage: 'LOST', score: 44, rep: sales2, msg: 'Too expensive.', ago: 47, intent: 'research', value: 100000 },
    { name: 'Meghna Rao', email: 'meghna.rao@example.com', interest: 'Necklace', bMin: 300000, bMax: 400000, stage: 'QUALIFIED', score: 66, rep: sales1, msg: 'Looking for a necklace set.', ago: 52, intent: 'purchase', value: 350000 },
    { name: 'Manish Oberoi', email: 'manish.oberoi@example.com', interest: 'Wedding Collection', stage: 'NEW', score: 0, rep: sales1, consent: 'NOT_GRANTED', source: 'csv_import', msg: '', ago: 2, intent: 'unknown' },
    { name: 'Pooja Desai', email: 'pooja.desai@example.com', interest: 'Gold Chain', stage: 'LOST', score: 30, rep: sales2, consent: 'WITHDRAWN', msg: 'Please stop contacting me.', ago: 20, intent: 'research' },
  ];

  const leadIds: Record<string, string> = {};
  for (const l of L) {
    const created = daysAgo(l.ago);
    const contact = await prisma.contact.create({ data: { tenantId: t.id, name: l.name, email: l.email, phone: l.phone, city: 'Mumbai', country: 'IN', consentStatus: l.consent ?? 'GRANTED', consentSource: l.source ?? 'website_enquiry', consentText: l.consent === 'NOT_GRANTED' ? null : 'Seed: consent captured on the public enquiry form', consentTimestamp: l.consent === 'NOT_GRANTED' ? null : created, createdAt: created } });
    const qualified = l.score > 0;
    const lead = await prisma.lead.create({
      data: {
        tenantId: t.id, contactId: contact.id, source: l.source ?? 'website_enquiry', productInterest: l.interest, budgetMin: l.bMin, budgetMax: l.bMax, purchaseTimeline: l.timeline, message: l.msg || null,
        appointmentDate: l.appt ? daysAgo(-5) : null, leadScore: qualified ? l.score : null, qualificationSource: qualified ? 'SIMULATED_RULES' : null,
        qualificationReason: qualified ? `Seeded example: ${l.intent} intent, ${l.bMin ? 'budget stated' : 'no budget'}${l.timeline ? `, timeline ${l.timeline}` : ''}.` : null,
        qualificationData: qualified ? { intent: l.intent, seeded: true, scoreIsHeuristic: true } : undefined,
        requiresHumanReview: !qualified, status: l.stage, assignedTo: l.rep.id, nextFollowUpAt: l.followUpInDays != null ? daysAgo(-l.followUpInDays) : null, createdAt: created,
        updatedAt: ['WON', 'LOST'].includes(l.stage) ? daysAgo(Math.max(l.ago - 3, 1)) : created,
      },
    });
    leadIds[l.name] = lead.id;
    await prisma.opportunity.create({ data: { tenantId: t.id, leadId: lead.id, name: `${l.interest} — ${l.name}`, estimatedValue: l.value ?? l.bMax ?? null, stage: l.stage, createdAt: created, updatedAt: ['WON', 'LOST'].includes(l.stage) ? daysAgo(Math.max(l.ago - 3, 1)) : created } });
    await prisma.activityLog.create({ data: { tenantId: t.id, entityType: 'lead', entityId: lead.id, leadId: lead.id, action: 'lead.created', metadata: { source: l.source ?? 'website_enquiry', seeded: true }, createdAt: created } });
    if (qualified) await prisma.activityLog.create({ data: { tenantId: t.id, entityType: 'lead', entityId: lead.id, leadId: lead.id, action: 'lead.qualified', metadata: { score: l.score, intent: l.intent, source: 'SIMULATED_RULES', seeded: true }, createdAt: new Date(created.getTime() + 60_000) } });
    if (l.stage !== 'NEW') await prisma.activityLog.create({ data: { tenantId: t.id, actorId: l.rep.id, entityType: 'lead', entityId: lead.id, leadId: lead.id, action: 'lead.stage_changed', metadata: { to: l.stage, seeded: true }, createdAt: new Date(created.getTime() + 3_600_000) } });
  }
  // a couple of tasks and a note
  await prisma.task.create({ data: { tenantId: t.id, leadId: leadIds['Priya Mehta'], title: 'Call Priya to confirm showroom appointment', dueAt: hoursAgo(-4), assignedTo: sales1.id, createdBy: sales1.id } });
  await prisma.task.create({ data: { tenantId: t.id, leadId: leadIds['Vikram Patel'], title: 'Send solitaire proposal PDF', dueAt: hoursAgo(2), assignedTo: sales1.id, createdBy: sales1.id } });
  await prisma.leadNote.create({ data: { tenantId: t.id, leadId: leadIds['Karan Shah'], authorId: sales1.id, body: 'Customer prefers 22K, wants to finalise making charges before Friday.' } });

  // creative jobs via the real processor, demo (simulated) adapter. Nothing is auto-approved except one example.
  const styles = [['DN-001', 'diwali_festive', '4:5'], ['BS-003', 'bridal_collection', '1:1'], ['ER-004', 'premium_black_gold', '9:16']] as const;
  const jobIds: string[] = [];
  for (const [sku, style, ratio] of styles) {
    const prod = await prisma.product.findFirstOrThrow({ where: { tenantId: t.id, sku } });
    const brief = buildCreativeBrief(prod, style, ratio);
    const job = await prisma.creativeJob.create({ data: { tenantId: t.id, productId: prod.id, sourceMediaId: products[sku].mediaId, prompt: brief.prompt, brief: brief as object, style, aspectRatio: ratio, variations: 2, provider: 'demo-simulation', simulated: true, requestedBy: designer.id } });
    await processCreativeJob({ prisma, env, storage }, { tenantId: t.id, creativeJobId: job.id });
    jobIds.push(job.id);
  }
  const assets = await prisma.generatedAsset.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'asc' } });
  // asset 0 approved (so it can be attached to a campaign), asset 1 pending review, the rest stay DRAFT
  await prisma.generatedAsset.update({ where: { id: assets[0].id }, data: { reviewStatus: 'APPROVED', reviewedBy: manager.id, reviewedAt: new Date(), reviewNotes: 'Seeded example approval' } });
  await prisma.approvalRequest.create({ data: { tenantId: t.id, resourceType: 'GENERATED_ASSET', resourceId: assets[0].id, requestedBy: designer.id, reviewedBy: manager.id, status: 'APPROVED', reviewedAt: new Date() } });
  await prisma.generatedAsset.update({ where: { id: assets[2].id }, data: { reviewStatus: 'PENDING_REVIEW' } });
  await prisma.approvalRequest.create({ data: { tenantId: t.id, resourceType: 'GENERATED_ASSET', resourceId: assets[2].id, requestedBy: designer.id } });

  const diwali = await prisma.campaign.create({ data: { tenantId: t.id, name: 'Diwali 2026 — Festive Gold', campaignType: 'FESTIVE', description: 'Festive creative set for Diwali.', startDate: daysAgo(-7), endDate: daysAgo(-30), status: 'DRAFT', budget: 150000 } });
  await prisma.campaignAsset.create({ data: { tenantId: t.id, campaignId: diwali.id, generatedAssetId: assets[0].id } });
  await prisma.campaign.create({ data: { tenantId: t.id, name: 'Bridal Season 2026', campaignType: 'BRIDAL', description: 'Bridal collection showcase.', status: 'DRAFT', budget: 250000 } });

  // a pending e-mail draft for Priya (deterministic template, labelled simulated). NOT sent, NOT approved.
  const d = simulatedDraft({ businessName: t.name, senderName: owner.fullName, customerFirstName: 'Priya', productInterest: 'Diamond Necklace', budgetText: '₹10,00,000 – ₹15,00,000', timeline: 'December 2026', appointmentText: null, message: null, tone: 'warm', catalogue: [{ name: 'Diamond Necklace', category: 'Necklace', sku: 'DN-001' }] });
  const draft = await prisma.communicationDraft.create({ data: { tenantId: t.id, leadId: leadIds['Priya Mehta'], recipient: 'priya.mehta@example.com', subject: d.subject, body: d.body + '\n\n—\nIf you would prefer not to hear from us, simply reply "STOP" and we will not contact you again.', status: 'PENDING_REVIEW', aiGenerated: true, aiSource: 'SIMULATED_RULES', createdBy: sales1.id } });
  await prisma.approvalRequest.create({ data: { tenantId: t.id, resourceType: 'COMMUNICATION_DRAFT', resourceId: draft.id, requestedBy: sales1.id } });
  await prisma.activityLog.create({ data: { tenantId: t.id, actorId: sales1.id, entityType: 'communication_draft', entityId: draft.id, leadId: leadIds['Priya Mehta'], action: 'email.draft_created', metadata: { aiGenerated: true, aiSource: 'SIMULATED_RULES' } } });

  void sales2; void manager; void jobIds;
  console.log(`Seed complete.\n  Tenant: ${t.name} (slug: ${t.slug})\n  Login: owner@suvarna.demo / ${PASSWORD}  (also manager@, designer@, sales@, sales2@, viewer@suvarna.demo)\n  Second tenant: owner@alnoor.demo / ${PASSWORD}\n  Platform admin: admin@techmunda.demo / ${PASSWORD}\n  Public enquiry page: /enquiry/suvarna-heritage`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

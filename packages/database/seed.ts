/**
 * Repeatable demo seed. Wipes and recreates the demo tenants (matched by slug).
 * All people, e-mails and phone numbers are synthetic. Product images are crops of the reference imagery supplied by the
 * project owner (packages/database/seed-assets). They look like photographs but are AI-style concept imagery: replace with client-authorised photos for real use.
 * Nothing here sends any message.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { PrismaClient, type LeadStage } from '@prisma/client';
import { buildCreativeBrief, createStorage, loadEnv, processCreativeJob, sha256, simulatedDraft } from '@techmunda/core';

const prisma = new PrismaClient();
const env = loadEnv({ ...process.env, AI_MODE: 'simulated' } as NodeJS.ProcessEnv); // seed never calls external AI
const storage = createStorage(env);
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@12345';

const PRODUCTS = [
  { sku: 'NK-001', name: 'Emerald Heritage Necklace', category: 'Necklace', photo: 'necklace-emerald', metalType: 'Gold', purity: '22K', stoneType: 'Emerald, Diamond', weight: 78.5, price: 485000, availability: 'IN_STOCK' },
  { sku: 'ER-004', name: 'Diamond Jhumka Earrings', category: 'Earrings', photo: 'earrings-jhumka', metalType: 'Gold', purity: '18K', stoneType: 'Diamond, Pearl', weight: 21.2, price: 168000, availability: 'IN_STOCK' },
  { sku: 'RG-012', name: 'Solitaire Diamond Ring', category: 'Ring', photo: 'ring-solitaire', metalType: 'Gold', purity: '18K', stoneType: 'Diamond', weight: 5.8, price: 235000, availability: 'IN_STOCK' },
  { sku: 'BG-005', name: 'Temple Gold Bangles', category: 'Bangles', photo: 'bangles-temple', metalType: 'Gold', purity: '22K', stoneType: 'Ruby', weight: 64.0, price: 312000, availability: 'MADE_TO_ORDER' },
  { sku: 'ST-006', name: 'Bridal Gold Set', category: 'Bridal Set', photo: 'bridal-set', metalType: 'Gold', purity: '22K', stoneType: 'Ruby, Emerald, Diamond', weight: 142.0, price: 675000, availability: 'MADE_TO_ORDER' },
  { sku: 'PD-009', name: 'Floral Pendant', category: 'Pendant', photo: 'pendant-floral', metalType: 'Gold', purity: '18K', stoneType: 'Diamond', weight: 6.4, price: 58000, availability: 'IN_STOCK' },
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
    const png = await sharp(path.join(__dirname, 'seed-assets', `${p.photo}.jpg`)).rotate().jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(png).metadata();
    const key = `${t.id}/originals/${randomUUID()}.jpg`;
    await storage.put(key, png, 'image/jpeg');
    const m = await prisma.productMedia.create({ data: { tenantId: t.id, productId: prod.id, storageKey: key, mimeType: 'image/jpeg', fileSize: png.length, checksum: sha256(png), width: meta.width, height: meta.height, isOriginal: true, rightsConfirmed: true, uploadedBy: designer.id } });
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
  const styles = [['NK-001', 'diwali_festive', '4:5'], ['ST-006', 'bridal_collection', '1:1'], ['ER-004', 'premium_black_gold', '9:16']] as const;
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
  const d = simulatedDraft({ businessName: t.name, senderName: owner.fullName, customerFirstName: 'Priya', productInterest: 'Diamond Necklace', budgetText: '₹10,00,000 – ₹15,00,000', timeline: 'December 2026', appointmentText: null, message: null, tone: 'warm', catalogue: [{ name: 'Emerald Heritage Necklace', category: 'Necklace', sku: 'NK-001' }] });
  const draft = await prisma.communicationDraft.create({ data: { tenantId: t.id, leadId: leadIds['Priya Mehta'], recipient: 'priya.mehta@example.com', subject: d.subject, body: d.body + '\n\n—\nIf you would prefer not to hear from us, simply reply "STOP" and we will not contact you again.', status: 'PENDING_REVIEW', aiGenerated: true, aiSource: 'SIMULATED_RULES', createdBy: sales1.id } });
  await prisma.approvalRequest.create({ data: { tenantId: t.id, resourceType: 'COMMUNICATION_DRAFT', resourceId: draft.id, requestedBy: sales1.id } });
  await prisma.activityLog.create({ data: { tenantId: t.id, actorId: sales1.id, entityType: 'communication_draft', entityId: draft.id, leadId: leadIds['Priya Mehta'], action: 'email.draft_created', metadata: { aiGenerated: true, aiSource: 'SIMULATED_RULES' } } });

  void sales2; void manager; void jobIds;
  console.log(`Seed complete.\n  Tenant: ${t.name} (slug: ${t.slug})\n  Login: owner@suvarna.demo / ${PASSWORD}  (also manager@, designer@, sales@, sales2@, viewer@suvarna.demo)\n  Second tenant: owner@alnoor.demo / ${PASSWORD}\n  Platform admin: admin@techmunda.demo / ${PASSWORD}\n  Public enquiry page: /enquiry/suvarna-heritage`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

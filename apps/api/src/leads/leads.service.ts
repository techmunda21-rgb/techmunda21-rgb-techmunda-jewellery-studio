import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CONSENT_TEXT, LEAD_STAGES, type PublicLeadInput } from '@techmunda/shared';
import { generateFollowUpDraft, parseBudget, suggestReplies, type DraftContext } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { found, num, pageArgs, paged } from '../common/helpers';
import { QueueService } from '../common/queue.service';
import { MediaUrlService } from '../media/media-url.service';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';

const OPEN_STAGES = ['NEW', 'QUALIFIED', 'CONTACTED', 'APPOINTMENT', 'PROPOSAL', 'NEGOTIATION'] as const;
const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

@Injectable()
export class LeadsService {
  private readonly logger = new Logger('Leads');
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv, private readonly queues: QueueService, private readonly audit: AuditService, private readonly urls: MediaUrlService) {}

  /* ───────────── capture (public form + automation) ───────────── */

  /**
   * Creates contact + lead (+ opportunity), records consent, assigns a sales user and queues qualification.
   * Returns nothing about existing records so the public endpoint cannot be used to probe for customers.
   */
  async capture(tenantId: string, input: PublicLeadInput, ip: string | null, source = 'website_enquiry') {
    const email = input.email?.toLowerCase();
    const phone = input.phone ? digits(input.phone) : undefined;
    const existingContact = await this.prisma.contact.findFirst({
      where: { tenantId, OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone && phone.length >= 7 ? [{ phone: { endsWith: phone.slice(-10) } }] : [])] },
    });
    if (existingContact) {
      const openLead = await this.prisma.lead.findFirst({
        where: { tenantId, contactId: existingContact.id, status: { in: [...OPEN_STAGES] }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
      });
      if (openLead) {
        await this.prisma.leadNote.create({ data: { tenantId, leadId: openLead.id, authorId: openLead.assignedTo ?? (await this.anyUserId(tenantId)), body: `Repeat enquiry received via ${source}: ${(input.message ?? '(no message)').slice(0, 500)}` } });
        await this.audit.activity({ tenantId, entityType: 'lead', entityId: openLead.id, leadId: openLead.id, action: 'lead.repeat_enquiry', metadata: { source } });
        return { leadId: openLead.id, duplicate: true };
      }
    }

    const budget = parseBudget(input.budgetRange);
    const now = new Date();
    const assignee = await this.pickAssignee(tenantId);
    const result = await this.prisma.$transaction(async (tx) => {
      const contact =
        existingContact ??
        (await tx.contact.create({ data: { tenantId, name: input.name, email, phone: input.phone, consentStatus: 'GRANTED', consentSource: source, consentText: CONSENT_TEXT, consentIp: ip, consentTimestamp: now } }));
      if (existingContact && existingContact.consentStatus !== 'GRANTED') {
        await tx.contact.update({ where: { id: existingContact.id }, data: { consentStatus: 'GRANTED', consentSource: source, consentText: CONSENT_TEXT, consentIp: ip, consentTimestamp: now } });
      }
      const lead = await tx.lead.create({
        data: {
          tenantId, contactId: contact.id, source, productInterest: input.productInterest, preferredMaterial: input.preferredMaterial,
          budgetMin: budget.min, budgetMax: budget.max, purchaseTimeline: input.purchaseTimeline, appointmentDate: input.appointmentDate,
          message: input.message, status: 'NEW', assignedTo: assignee?.id ?? null, nextFollowUpAt: new Date(now.getTime() + 24 * 3_600_000),
        },
      });
      await tx.opportunity.create({ data: { tenantId, leadId: lead.id, name: `${input.productInterest ?? 'Jewellery enquiry'} — ${input.name}`, estimatedValue: budget.max ?? budget.min, stage: 'NEW' } });
      await this.audit.activity({ tenantId, entityType: 'lead', entityId: lead.id, leadId: lead.id, action: 'lead.created', metadata: { source } }, tx);
      await this.audit.activity({ tenantId, entityType: 'contact', entityId: contact.id, leadId: lead.id, action: 'consent.recorded', metadata: { source, consent: 'GRANTED' } }, tx);
      if (assignee) await tx.notification.create({ data: { tenantId, userId: assignee.id, type: 'lead.assigned', title: `New enquiry from ${input.name}`, body: input.productInterest ?? undefined, link: `/leads/${lead.id}` } });
      return lead;
    });
    await this.queues.enqueueQualification({ tenantId, leadId: result.id });
    return { leadId: result.id, duplicate: false };
  }

  private async anyUserId(tenantId: string) {
    return (await this.prisma.user.findFirstOrThrow({ where: { tenantId, status: 'ACTIVE' }, select: { id: true } })).id;
  }

  /** Least-loaded active sales executive (simple fair round-robin). */
  private async pickAssignee(tenantId: string) {
    const reps = await this.prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', role: 'SALES_EXECUTIVE' }, select: { id: true, fullName: true } });
    if (!reps.length) return null;
    const counts = await this.prisma.lead.groupBy({ by: ['assignedTo'], where: { tenantId, status: { in: [...OPEN_STAGES] }, assignedTo: { in: reps.map((r) => r.id) } }, _count: true });
    const load = new Map(counts.map((c) => [c.assignedTo, c._count]));
    return [...reps].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
  }

  /* ───────────── reads ───────────── */

  /** Maps a free-text interest to a catalogue category so CRM cards can show the matching real product photo. */
  static categoryFor(interest?: string | null): string | null {
    const t = (interest ?? '').toLowerCase();
    const rules: Array<[RegExp, string]> = [[/pendant|mangalsutra/, 'Pendant'], [/bridal|wedding/, 'Bridal Set'], [/earring|jhumk|stud/, 'Earrings'], [/bangle|kada|bracelet/, 'Bangles'], [/ring|solitaire|engagement/, 'Ring'], [/necklace|haar|choker|chain|polki|temple/, 'Necklace']];
    return rules.find(([re]) => re.test(t))?.[1] ?? null;
  }

  /** One query per request: category → signed thumbnail URL of the tenant's first product in that category. */
  private async imageMap(tenantId: string): Promise<Map<string, { url: string; name: string }>> {
    const products = await this.prisma.product.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' }, include: { media: { where: { isOriginal: true }, orderBy: { createdAt: 'asc' }, take: 1 } } });
    const map = new Map<string, { url: string; name: string }>();
    for (const p of products) {
      const m = p.media[0];
      if (m && !map.has(p.category)) map.set(p.category, { url: await this.urls.viewUrl(tenantId, m.storageKey, m.mimeType, { ttl: 3600 }), name: p.name });
    }
    return map;
  }

  private withImage<T extends { productInterest: string | null }>(row: T, map: Map<string, { url: string; name: string }>) {
    const cat = LeadsService.categoryFor(row.productInterest);
    const hit = cat ? map.get(cat) : undefined;
    return { ...row, productImageUrl: hit?.url ?? null, productImageName: hit?.name ?? null };
  }

  private leadRow(l: any) {
    return {
      id: l.id, source: l.source, status: l.status, productInterest: l.productInterest, preferredMaterial: l.preferredMaterial,
      budgetMin: num(l.budgetMin), budgetMax: num(l.budgetMax), purchaseTimeline: l.purchaseTimeline, appointmentDate: l.appointmentDate,
      message: l.message, leadScore: l.leadScore, qualificationReason: l.qualificationReason, qualificationSource: l.qualificationSource,
      qualificationData: l.qualificationData, requiresHumanReview: l.requiresHumanReview, assignedTo: l.assignedTo, nextFollowUpAt: l.nextFollowUpAt,
      createdAt: l.createdAt, updatedAt: l.updatedAt,
      contact: l.contact && { id: l.contact.id, name: l.contact.name, email: l.contact.email, phone: l.contact.phone, city: l.contact.city, country: l.contact.country, consentStatus: l.contact.consentStatus, consentTimestamp: l.contact.consentTimestamp },
      estimatedValue: num(l.opportunities?.[0]?.estimatedValue),
      opportunityId: l.opportunities?.[0]?.id ?? null,
    };
  }

  async list(user: AuthUser, q: { page: number; pageSize: number; q?: string; status?: string; assignedTo?: string; minScore?: number }) {
    const where: any = { tenantId: user.tenantId };
    if (q.status) where.status = q.status;
    if (q.assignedTo) where.assignedTo = q.assignedTo === 'me' ? user.id : q.assignedTo;
    if (q.minScore != null) where.leadScore = { gte: q.minScore };
    if (q.q) where.OR = [{ productInterest: { contains: q.q, mode: 'insensitive' } }, { contact: { name: { contains: q.q, mode: 'insensitive' } } }, { contact: { email: { contains: q.q, mode: 'insensitive' } } }, { contact: { phone: { contains: q.q } } }];
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }], ...pageArgs(q.page, q.pageSize), include: { contact: true, opportunities: { take: 1, orderBy: { createdAt: 'asc' } } } }),
      this.prisma.lead.count({ where }),
    ]);
    const imgs = await this.imageMap(user.tenantId);
    return paged(rows.map((r) => this.withImage(this.leadRow(r), imgs)), total, q.page, q.pageSize);
  }

  async board(user: AuthUser, search?: string) {
    const where: any = { tenantId: user.tenantId };
    if (search) where.OR = [{ productInterest: { contains: search, mode: 'insensitive' } }, { contact: { name: { contains: search, mode: 'insensitive' } } }];
    const rows = await this.prisma.lead.findMany({ where, orderBy: [{ leadScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], include: { contact: true, opportunities: { take: 1, orderBy: { createdAt: 'asc' } } }, take: 400 });
    const imgs = await this.imageMap(user.tenantId);
    const stages = LEAD_STAGES.map((stage) => {
      const items = rows.filter((r) => r.status === stage);
      return { stage, count: items.length, totalValue: items.reduce((s, i) => s + (num(i.opportunities[0]?.estimatedValue) ?? 0), 0), leads: items.slice(0, 50).map((r) => this.withImage(this.leadRow(r), imgs)) };
    });
    return { stages };
  }

  async get(user: AuthUser, id: string) {
    const l = found(
      await this.prisma.lead.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { contact: true, opportunities: { orderBy: { createdAt: 'asc' } }, notes: { orderBy: { createdAt: 'desc' } }, tasks: { orderBy: { createdAt: 'desc' } }, drafts: { orderBy: { createdAt: 'desc' }, select: { id: true, subject: true, status: true, version: true, createdAt: true, sentAt: true } } },
      }),
      'Lead',
    );
    const activities = await this.prisma.activityLog.findMany({ where: { tenantId: user.tenantId, leadId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { ...this.withImage(this.leadRow(l), await this.imageMap(user.tenantId)), opportunities: l.opportunities.map((o) => ({ id: o.id, name: o.name, estimatedValue: num(o.estimatedValue), currency: o.currency, stage: o.stage, expectedCloseDate: o.expectedCloseDate })), notes: l.notes, tasks: l.tasks, drafts: l.drafts, activities };
  }

  /* ───────────── writes ───────────── */

  async update(user: AuthUser, id: string, body: { status?: string; assignedTo?: string | null; nextFollowUpAt?: Date | null; productInterest?: string | null; budgetMin?: number | null; budgetMax?: number | null }) {
    const lead = found(await this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId } }), 'Lead');
    if (body.assignedTo) found(await this.prisma.user.findFirst({ where: { id: body.assignedTo, tenantId: user.tenantId, status: 'ACTIVE' }, select: { id: true } }), 'Assignee');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.lead.update({ where: { id }, data: body as any, include: { contact: true, opportunities: { take: 1, orderBy: { createdAt: 'asc' } } } });
      if (body.status && body.status !== lead.status) {
        await tx.opportunity.updateMany({ where: { tenantId: user.tenantId, leadId: id }, data: { stage: body.status as any } });
        await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: id, leadId: id, action: 'lead.stage_changed', metadata: { from: lead.status, to: body.status } }, tx);
      }
      if (body.assignedTo !== undefined && body.assignedTo !== lead.assignedTo) {
        await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: id, leadId: id, action: 'lead.assigned', metadata: { to: body.assignedTo } }, tx);
        if (body.assignedTo) await tx.notification.create({ data: { tenantId: user.tenantId, userId: body.assignedTo, type: 'lead.assigned', title: `Lead assigned: ${u.contact.name}`, link: `/leads/${id}` } });
      }
      return u;
    });
    return this.leadRow(updated);
  }

  async requalify(user: AuthUser, id: string) {
    found(await this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Lead');
    await this.queues.enqueueQualification({ tenantId: user.tenantId, leadId: id });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: id, leadId: id, action: 'lead.requalify_requested' });
    return { queued: true };
  }

  async addNote(user: AuthUser, id: string, body: string) {
    found(await this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Lead');
    const note = await this.prisma.leadNote.create({ data: { tenantId: user.tenantId, leadId: id, authorId: user.id, body } });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: id, leadId: id, action: 'note.added' });
    return note;
  }

  async addTask(user: AuthUser, id: string, input: { title: string; dueAt?: Date; assignedTo?: string }) {
    found(await this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Lead');
    const task = await this.prisma.task.create({ data: { tenantId: user.tenantId, leadId: id, title: input.title, dueAt: input.dueAt, assignedTo: input.assignedTo ?? user.id, createdBy: user.id } });
    if (input.dueAt) await this.prisma.lead.update({ where: { id }, data: { nextFollowUpAt: input.dueAt } });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'task', entityId: task.id, leadId: id, action: 'task.created', metadata: { title: input.title } });
    return task;
  }

  async updateTask(user: AuthUser, taskId: string, body: { completed?: boolean; dueAt?: Date | null }) {
    const t = found(await this.prisma.task.findFirst({ where: { id: taskId, tenantId: user.tenantId } }), 'Task');
    const task = await this.prisma.task.update({ where: { id: taskId }, data: { ...(body.completed !== undefined ? { completedAt: body.completed ? new Date() : null } : {}), ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}) } });
    if (body.completed) await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'task', entityId: t.id, leadId: t.leadId, action: 'task.completed', metadata: { title: t.title } });
    return task;
  }

  async pendingTasks(user: AuthUser) {
    const rows = await this.prisma.task.findMany({ where: { tenantId: user.tenantId, completedAt: null }, orderBy: { dueAt: { sort: 'asc', nulls: 'last' } }, take: 50, include: { lead: { select: { id: true, contact: { select: { name: true } } } } } });
    return { data: rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, leadId: t.leadId, leadName: t.lead.contact.name, overdue: !!t.dueAt && t.dueAt < new Date() })) };
  }

  async suggest(user: AuthUser, id: string, tone: 'warm' | 'concise' | 'formal') {
    const ctx = await this.draftContext(user, id, tone);
    return suggestReplies(this.env, ctx);
  }

  async draftContext(user: AuthUser, leadId: string, tone: 'warm' | 'concise' | 'formal' = 'warm'): Promise<DraftContext> {
    const lead = found(await this.prisma.lead.findFirst({ where: { id: leadId, tenantId: user.tenantId }, include: { contact: true, tenant: true } }), 'Lead');
    const catalogue = lead.productInterest
      ? await this.prisma.product.findMany({ where: { tenantId: user.tenantId, availability: { not: 'OUT_OF_STOCK' }, OR: [{ category: { contains: lead.productInterest.split(' ')[0], mode: 'insensitive' } }, { name: { contains: lead.productInterest.split(' ')[0], mode: 'insensitive' } }] }, take: 3, select: { name: true, category: true, sku: true } })
      : [];
    const fmt = (n: unknown) => (n == null ? null : new Intl.NumberFormat('en-IN').format(Number(n)));
    const budgetText = lead.budgetMin != null || lead.budgetMax != null ? [lead.budgetMin, lead.budgetMax].filter((x) => x != null).map(fmt).join(' – ') : null;
    return {
      businessName: lead.tenant.name, senderName: user.fullName, customerFirstName: lead.contact.name.split(' ')[0],
      productInterest: lead.productInterest, budgetText: budgetText ? `${lead.tenant.currency === 'INR' ? '₹' : lead.tenant.currency + ' '}${budgetText}` : null,
      timeline: lead.purchaseTimeline, appointmentText: lead.appointmentDate ? lead.appointmentDate.toDateString() : null, message: lead.message, tone, catalogue,
    };
  }

  /* ───────────── CSV import ───────────── */

  async importPreview(user: AuthUser, csv: string) {
    const rows = parseCsv(csv);
    if (!rows.length) throw new BadRequestException({ code: 'EMPTY_CSV', message: 'No data rows found. Expected columns: name, email, phone, product_interest, city' });
    if (rows.length > 1000) throw new BadRequestException({ code: 'CSV_TOO_LARGE', message: 'Import at most 1,000 rows at a time' });
    const existing = await this.prisma.contact.findMany({ where: { tenantId: user.tenantId }, select: { email: true, phone: true, name: true } });
    const emails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean));
    const phones = new Set(existing.map((c) => digits(c.phone).slice(-10)).filter((p) => p.length >= 7));
    const seenE = new Set<string>();
    const seenP = new Set<string>();
    const out = rows.map((r, i) => {
      const problems: string[] = [];
      const email = r.email?.trim().toLowerCase() || undefined;
      const phone = r.phone?.trim() || undefined;
      if (!r.name || r.name.trim().length < 2) problems.push('Name is required');
      if (!email && !phone) problems.push('Email or phone is required');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('Invalid email');
      let duplicateOf: 'existing' | 'file' | null = null;
      const p10 = digits(phone).slice(-10);
      if ((email && emails.has(email)) || (p10.length >= 7 && phones.has(p10))) duplicateOf = 'existing';
      else if ((email && seenE.has(email)) || (p10.length >= 7 && seenP.has(p10))) duplicateOf = 'file';
      if (email) seenE.add(email);
      if (p10.length >= 7) seenP.add(p10);
      return { row: i + 2, name: r.name?.trim() ?? '', email, phone, productInterest: r.product_interest?.trim() || undefined, city: r.city?.trim() || undefined, problems, duplicateOf, importable: problems.length === 0 && !duplicateOf };
    });
    return { rows: out, summary: { total: out.length, importable: out.filter((r) => r.importable).length, duplicates: out.filter((r) => r.duplicateOf).length, invalid: out.filter((r) => r.problems.length).length } };
  }

  /** Imported contacts have NO marketing consent: they cannot be emailed until consent is captured. */
  async importCommit(user: AuthUser, rows: Array<{ name: string; email?: string; phone?: string; productInterest?: string; city?: string }>) {
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const email = r.email?.toLowerCase();
      const dup = await this.prisma.contact.findFirst({ where: { tenantId: user.tenantId, OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(r.phone && digits(r.phone).length >= 7 ? [{ phone: { endsWith: digits(r.phone).slice(-10) } }] : [])] }, select: { id: true } });
      if (dup) { skipped++; continue; }
      const assignee = await this.pickAssignee(user.tenantId);
      await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({ data: { tenantId: user.tenantId, name: r.name, email, phone: r.phone, city: r.city, consentStatus: 'NOT_GRANTED', consentSource: 'csv_import' } });
        const lead = await tx.lead.create({ data: { tenantId: user.tenantId, contactId: contact.id, source: 'csv_import', productInterest: r.productInterest, status: 'NEW', assignedTo: assignee?.id ?? user.id } });
        await tx.opportunity.create({ data: { tenantId: user.tenantId, leadId: lead.id, name: `${r.productInterest ?? 'Imported lead'} — ${r.name}`, stage: 'NEW' } });
        await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: lead.id, leadId: lead.id, action: 'lead.imported', metadata: { source: 'csv_import', consent: 'NOT_GRANTED' } }, tx);
      });
      created++;
    }
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'leads.csv_imported', resourceType: 'lead', metadata: { created, skipped } });
    return { created, skipped };
  }

  async generateDraftContent(user: AuthUser, leadId: string) {
    return generateFollowUpDraft(this.env, await this.draftContext(user, leadId));
  }

  async withdrawConsent(user: AuthUser, contactId: string) {
    found(await this.prisma.contact.findFirst({ where: { id: contactId, tenantId: user.tenantId }, select: { id: true } }), 'Contact');
    const leads = await this.prisma.lead.findMany({ where: { tenantId: user.tenantId, contactId }, select: { id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({ where: { id: contactId }, data: { consentStatus: 'WITHDRAWN' } });
      await tx.communicationDraft.updateMany({ where: { tenantId: user.tenantId, leadId: { in: leads.map((l) => l.id) }, status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SEND_FAILED'] } }, data: { status: 'REJECTED', lastError: 'Recipient withdrew consent' } });
      for (const l of leads) await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'contact', entityId: contactId, leadId: l.id, action: 'consent.withdrawn' }, tx);
    });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'consent.withdrawn', resourceType: 'contact', resourceId: contactId });
    return { consentStatus: 'WITHDRAWN' };
  }
}

/** Minimal RFC-4180-ish CSV parser (quotes, commas, newlines). Header row required. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some((x) => x.trim() !== '')) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((x) => x.trim() !== '')) rows.push(cur);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').replace(/^[=+@-](?=[A-Za-z(])/, "'$&")])));
}

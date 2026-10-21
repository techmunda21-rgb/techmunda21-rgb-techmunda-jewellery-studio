import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import request from 'supertest';
import { createHmac } from 'crypto';
import { encryptSecret } from '@techmunda/core';
import { prisma } from '@techmunda/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { tenantWebhookSecret } from '../src/automation/automation.guard';
import { IpBanService } from '../src/security/ip-ban.service';
import { MailError, MailService } from '../src/security/mail.service';
import { OTP_DELIVERY, type OtpChannel, type OtpDelivery } from '../src/signup/otp-delivery';
import { GMAIL_GATEWAY, GmailError, type GmailConnection, type GmailGateway } from '../src/integrations/gmail.gateway';

export const PASSWORD = 'Test@12345';

/** Controllable fake Gmail — records what would have been sent. Never touches the network. */
export class FakeGmail implements GmailGateway {
  drafts = new Map<string, string>();
  sent: Array<{ draftId: string; messageId: string }> = [];
  failNextSend: GmailError[] = [];
  failDraft: GmailError | null = null;
  delayMs = 0;
  private n = 0;
  async upsertDraft(_c: GmailConnection, raw: string, existing?: string | null) {
    if (this.failDraft) throw this.failDraft;
    const id = existing && this.drafts.has(existing) ? existing : `draft-${++this.n}`;
    this.drafts.set(id, raw);
    return { draftId: id };
  }
  async sendDraft(_c: GmailConnection, draftId: string) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const err = this.failNextSend.shift();
    if (err) throw err;
    if (!this.drafts.has(draftId)) throw new GmailError('draft not found', 'FATAL');
    const messageId = `gmsg-${this.sent.length + 1}`;
    this.sent.push({ draftId, messageId });
    this.drafts.delete(draftId);
    return { messageId, threadId: 't1' };
  }
  reset() {
    this.drafts.clear();
    this.sent = [];
    this.failNextSend = [];
    this.failDraft = null;
    this.delayMs = 0;
  }
}

/** Captures one-time codes in memory (the real adapters send e-mail/SMS). */
export class FakeOtp implements OtpDelivery {
  available: OtpChannel[] = ['EMAIL', 'SMS'];
  sent: Array<{ channel: OtpChannel; to: string; code: string }> = [];
  failNext = false;
  channels() { return this.available; }
  async send(channel: OtpChannel, to: string, code: string) {
    if (this.failNext) { this.failNext = false; throw new Error('provider down'); }
    this.sent.push({ channel, to, code });
  }
  last() { return this.sent[this.sent.length - 1]; }
  reset() { this.available = ['EMAIL', 'SMS']; this.sent = []; this.failNext = false; }
}

/** Captures security alert / test e-mails in memory. */
export class FakeMail {
  configured = true;
  failWith: MailError | null = null;
  sent: Array<{ to: string; subject: string; text: string }> = [];
  isConfigured() { return this.configured; }
  viaApi() { return false; }
  missing() { return this.configured ? [] : ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']; }
  from() { return 'Techmunda <noreply@test>'; }
  async send(m: { to: string; subject: string; text: string }) {
    if (!this.configured) throw new MailError('E-mail is not configured', 'NOT_CONFIGURED');
    if (this.failWith) throw this.failWith;
    this.sent.push({ to: m.to, subject: m.subject, text: m.text });
  }
  async verify() { return this.failWith ? { ok: false, error: this.failWith.message } : { ok: true }; }
  reset() { this.configured = true; this.failWith = null; this.sent = []; }
}

export async function createApp() {
  const mail = new FakeMail();
  const gmail = new FakeGmail();
  const otp = new FakeOtp();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GMAIL_GATEWAY).useValue(gmail).overrideProvider(OTP_DELIVERY).useValue(otp).overrideProvider(MailService).useValue(mail).compile();
  const app = mod.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  // every request gets its own client IP so per-IP throttles never couple unrelated tests
  let n = 0;
  const server = app.getHttpServer();
  const ipv = () => `198.51.${Math.floor(++n / 250) % 250}.${(n % 250) + 1}`;
  const http = () => {
    const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (url: string) => (request(server) as any)[m](url).set('X-Forwarded-For', ipv());
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') } as unknown as request.Agent;
  };
  const bans = app.get(IpBanService);
  return { app, gmail, otp, mail, bans, http };
}

export interface World {
  A: { tenantId: string; slug: string; owner: U; manager: U; designer: U; sales: U; viewer: U };
  B: { tenantId: string; slug: string; owner: U };
}
interface U { id: string; email: string }

export async function resetWorld(): Promise<World> {
  await prisma.tenant.deleteMany({ where: { OR: [{ slug: { in: ['test-a', 'test-b'] } }, { slug: { startsWith: 'signup-' } }] } });
  await prisma.signupRequest.deleteMany({});
  const hash = await bcrypt.hash(PASSWORD, 4);
  const make = async (slug: string, name: string, users: Array<[string, any]>) => {
    const t = await prisma.tenant.create({ data: { name, slug } });
    const out: Record<string, U> = {};
    for (const [key, role] of users) {
      const u = await prisma.user.create({ data: { tenantId: t.id, fullName: `${key} ${slug}`, email: `${key}@${slug}.test`, passwordHash: hash, role } });
      out[key] = { id: u.id, email: u.email };
    }
    return { tenantId: t.id, slug, ...out };
  };
  const A = (await make('test-a', 'Tenant A Jewellers', [['owner', 'TENANT_OWNER'], ['manager', 'MANAGER'], ['designer', 'DESIGNER'], ['sales', 'SALES_EXECUTIVE'], ['viewer', 'VIEWER']])) as unknown as World['A'];
  const B = (await make('test-b', 'Tenant B Jewellers', [['owner', 'TENANT_OWNER']])) as unknown as World['B'];
  return { A, B };
}

export async function login(http: () => request.Agent, email: string, password = PASSWORD) {
  const res = await http().post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export async function pngBuffer(color = '#c9983f') {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: color } }).png().toBuffer();
}

/** Upload helper using the same 3-step flow as the web app. */
export async function uploadImage(http: () => request.Agent, auth: Record<string, string>, productId: string, buf: Buffer, mimeType = 'image/png', rights = true) {
  const up = await http().post('/api/v1/media/upload-url').set(auth).send({ productId, fileName: 'x.png', mimeType, fileSize: buf.length, rightsConfirmed: rights });
  if (up.status !== 201) return { up };
  const path = new URL(up.body.uploadUrl).pathname;
  const put = await http().put(path).set('Content-Type', mimeType).send(buf);
  const confirm = await http().post('/api/v1/media/confirm').set(auth).send({ uploadToken: up.body.uploadToken });
  return { up, put, confirm };
}

export async function makeProduct(http: () => request.Agent, auth: Record<string, string>, sku = 'T-001') {
  const res = await http().post('/api/v1/products').set(auth).send({ sku, name: 'Test Necklace', category: 'Necklace', metalType: 'Gold', purity: '22K' });
  if (res.status !== 201) throw new Error(`product create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

export function webhookHeaders(tenantId: string, body: unknown, opts: { secretTenantId?: string; ts?: number; badSig?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const secret = tenantWebhookSecret(process.env.AUTOMATION_WEBHOOK_SECRET!, opts.secretTenantId ?? tenantId);
  const sig = opts.badSig ? 'deadbeef' : createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return { raw, headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-automation-timestamp': ts, 'x-automation-signature': sig } };
}

export async function connectGmail(tenantId: string, status: 'ACTIVE' | 'REVOKED' = 'ACTIVE') {
  await prisma.integrationConnection.deleteMany({ where: { tenantId } });
  return prisma.integrationConnection.create({
    data: { tenantId, provider: 'google', accountIdentifier: 'sender@test.example', status, encryptedCredentialsReference: encryptSecret(JSON.stringify({ refresh_token: 'rt-test' }), process.env.ENCRYPTION_KEY!) },
  });
}

export async function makeLead(tenantId: string, assignedTo: string, opts: { email?: string; consent?: 'GRANTED' | 'NOT_GRANTED' | 'WITHDRAWN'; name?: string; status?: any } = {}) {
  const contact = await prisma.contact.create({ data: { tenantId, name: opts.name ?? 'Priya Test', email: opts.email ?? `priya${Math.random().toString(36).slice(2, 7)}@example.com`, phone: '+91 90000 00000', consentStatus: opts.consent ?? 'GRANTED', consentTimestamp: new Date(), consentSource: 'test' } });
  const lead = await prisma.lead.create({ data: { tenantId, contactId: contact.id, source: 'website_enquiry', productInterest: 'Diamond Necklace', budgetMin: 1000000, budgetMax: 1500000, status: opts.status ?? 'QUALIFIED', assignedTo, leadScore: 80, nextFollowUpAt: new Date(Date.now() - 3600_000) } });
  await prisma.opportunity.create({ data: { tenantId, leadId: lead.id, name: 'Opp', estimatedValue: 1250000, stage: opts.status ?? 'QUALIFIED' } });
  return { lead, contact };
}

export type App = INestApplication;

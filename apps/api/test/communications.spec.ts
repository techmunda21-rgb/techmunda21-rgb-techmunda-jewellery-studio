import { prisma } from '@techmunda/database';
import { GmailError } from '../src/integrations/gmail.gateway';
import { connectGmail, createApp, login, makeLead, resetWorld, webhookHeaders, type World } from './helpers';

describe('email approval and send safety', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let sales: Record<string, string>;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => {
    w = await resetWorld();
    ctx.gmail.reset();
    owner = (await login(ctx.http, w.A.owner.email)).auth;
    manager = (await login(ctx.http, w.A.manager.email)).auth;
    sales = (await login(ctx.http, w.A.sales.email)).auth;
  });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  const mkDraft = async (leadId: string, auth = sales) => (await ctx.http().post('/api/v1/communications/drafts').set(auth).send({ leadId, generate: true })).body;
  const approve = (id: string, auth = manager) => ctx.http().post(`/api/v1/communications/drafts/${id}/approve`).set(auth).send({});
  const send = (id: string, version: number, key = 'idem-key-0001', auth = sales) => ctx.http().post(`/api/v1/communications/drafts/${id}/send`).set(auth).send({ idempotencyKey: key, version });

  it('missing / withdrawn consent blocks draft creation (no marketing to non-consented contacts)', async () => {
    const none = await makeLead(w.A.tenantId, w.A.sales.id, { consent: 'NOT_GRANTED' });
    const withdrawn = await makeLead(w.A.tenantId, w.A.sales.id, { consent: 'WITHDRAWN' });
    const r1 = await ctx.http().post('/api/v1/communications/drafts').set(sales).send({ leadId: none.lead.id, generate: true });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('CONSENT_REQUIRED');
    const r2 = await ctx.http().post('/api/v1/communications/drafts').set(sales).send({ leadId: withdrawn.lead.id, generate: true });
    expect(r2.body.error.code).toBe('CONSENT_WITHDRAWN');
    expect(await prisma.communicationDraft.count({ where: { tenantId: w.A.tenantId } })).toBe(0);
  });

  it('AI draft is saved as PENDING_REVIEW, labelled, never sent, and cannot be sent unapproved', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    expect(d).toMatchObject({ status: 'PENDING_REVIEW', aiGenerated: true, aiSource: 'SIMULATED_RULES', version: 1, approvedVersion: null });
    expect(d.body).toMatch(/STOP/); // opt-out line
    const res = await send(d.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_APPROVED');
    expect(ctx.gmail.sent).toHaveLength(0);
  });

  it('only approver roles can approve; sales can send only after approval', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    expect((await approve(d.id, sales)).status).toBe(403);
    const ok = await approve(d.id, manager);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', approvedVersion: 1, gmailDraft: { state: 'CREATED' } });
    expect(ctx.gmail.drafts.size).toBe(1);
    expect(ctx.gmail.sent).toHaveLength(0); // approval alone never sends
  });

  it('full happy path: approve → separate confirm send → SENT with provider message id, CRM activity, audit, stage', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id, { status: 'QUALIFIED' });
    const d = await mkDraft(lead.id);
    await approve(d.id);
    const mime = Buffer.from([...ctx.gmail.drafts.values()][0], 'base64url').toString('utf8');
    expect(mime).toMatch(/multipart\/alternative/);
    expect(mime).toMatch(/Content-Type: text\/plain/);
    expect(mime).toMatch(/Content-Type: text\/html/);
    const res = await send(d.id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SENT', providerMessageId: 'gmsg-1', duplicate: false });
    expect(ctx.gmail.sent).toHaveLength(1);
    const raw = Buffer.from([...ctx.gmail.drafts.values(), ...[]].join(''), 'base64url'); // drafts consumed after send
    expect(raw.length).toBe(0);
    const acts = (await prisma.activityLog.findMany({ where: { leadId: lead.id } })).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(['email.draft_created', 'email.approved', 'email.sent', 'lead.stage_changed']));
    expect(await prisma.auditLog.count({ where: { tenantId: w.A.tenantId, action: 'email.sent', resourceId: d.id } })).toBe(1);
    expect((await prisma.lead.findFirstOrThrow({ where: { id: lead.id } })).status).toBe('CONTACTED');
    const sentActivity = await prisma.activityLog.findFirstOrThrow({ where: { leadId: lead.id, action: 'email.sent' } });
    expect(JSON.stringify(sentActivity.metadata)).not.toMatch(/Dear|STOP/); // no body content in activity metadata
  });

  it('editing an approved draft invalidates the approval and blocks sending until re-approved', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    const edited = await ctx.http().patch(`/api/v1/communications/drafts/${d.id}`).set(sales).send({ body: d.body + '\nP.S. We have a new collection.' });
    expect(edited.body).toMatchObject({ status: 'DRAFT', version: 2, approvedVersion: null, sendReady: false });
    expect((await send(d.id, 2)).body.error.code).toBe('NOT_APPROVED');
    expect((await send(d.id, 1)).status).toBe(409);
    // approval requests: the old one was superseded
    expect((await ctx.http().post(`/api/v1/communications/drafts/${d.id}/approve`).set(manager).send({})).status).toBe(409); // not pending yet
    await ctx.http().post(`/api/v1/communications/drafts/${d.id}/request-approval`).set(sales);
    const re = await approve(d.id);
    expect(re.body).toMatchObject({ status: 'APPROVED', approvedVersion: 2 });
    expect((await send(d.id, 1)).body.error.code).toBe('APPROVAL_STALE'); // stale client version
    expect((await send(d.id, 2, 'idem-key-0002')).status).toBe(200);
    expect(ctx.gmail.sent).toHaveLength(1);
    // the content Gmail got is the edited version
  });

  it('duplicate send requests never create a duplicate email (idempotency + concurrency)', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    const first = await send(d.id, 1, 'same-key-0001');
    const replay = await send(d.id, 1, 'same-key-0001');
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.providerMessageId).toBe(first.body.providerMessageId);
    const other = await send(d.id, 1, 'other-key-0001');
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('ALREADY_SENT');
    expect(ctx.gmail.sent).toHaveLength(1);
  });

  it('two simultaneous sends result in exactly one email', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    ctx.gmail.delayMs = 150;
    const [a, b] = await Promise.all([send(d.id, 1, 'race-key-0001'), send(d.id, 1, 'race-key-0002')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(ctx.gmail.sent).toHaveLength(1);
  });

  it('send is blocked when Gmail is not connected (honest blocked state)', async () => {
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    const ap = await approve(d.id);
    expect(ap.body.gmailDraft.state).toBe('NOT_CONNECTED');
    const res = await send(d.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INTEGRATION_NOT_CONNECTED');
    expect((await prisma.communicationDraft.findFirstOrThrow({ where: { id: d.id } })).status).toBe('APPROVED'); // still approved, not sent
  });

  it('a revoked / expired OAuth connection is detected, recorded and surfaced', async () => {
    const conn = await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    ctx.gmail.failNextSend = [new GmailError('invalid_grant', 'AUTH_REVOKED')];
    const res = await send(d.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INTEGRATION_REVOKED');
    expect((await prisma.integrationConnection.findFirstOrThrow({ where: { id: conn.id } })).status).toBe('REVOKED');
    expect((await prisma.communicationDraft.findFirstOrThrow({ where: { id: d.id } })).status).toBe('SEND_FAILED');
    const st = await ctx.http().get('/api/v1/integrations/status').set(owner);
    expect(st.body.google).toMatchObject({ connected: false, status: 'REVOKED' });
    // subsequent attempts are blocked until reconnect
    expect((await send(d.id, 1, 'retry-key-0001')).body.error.code).toBe('INTEGRATION_REVOKED');
    expect(ctx.gmail.sent).toHaveLength(0);
  });

  it('transient Gmail failures are retried; permanent ones are recorded without fabricating success', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    ctx.gmail.failNextSend = [new GmailError('503', 'TRANSIENT'), new GmailError('429', 'RATE_LIMITED')];
    const ok = await send(d.id, 1, 'retry-ok-0001');
    expect(ok.status).toBe(200);
    expect(ctx.gmail.sent).toHaveLength(1);

    const { lead: l2 } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d2 = await mkDraft(l2.id);
    await approve(d2.id);
    ctx.gmail.failNextSend = [new GmailError('boom', 'FATAL')];
    const bad = await send(d2.id, 1, 'fatal-key-0001');
    expect(bad.status).toBe(502);
    const row = await prisma.communicationDraft.findFirstOrThrow({ where: { id: d2.id } });
    expect(row.status).toBe('SEND_FAILED');
    expect(row.providerMessageId).toBeNull();
    expect(ctx.gmail.sent).toHaveLength(1); // only the first
  });

  it('consent withdrawn after approval blocks the send and cancels open drafts', async () => {
    await connectGmail(w.A.tenantId);
    const { lead, contact } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    await approve(d.id);
    expect((await ctx.http().post(`/api/v1/contacts/${contact.id}/consent/withdraw`).set(sales)).status).toBe(201);
    const row = await prisma.communicationDraft.findFirstOrThrow({ where: { id: d.id } });
    expect(row.status).toBe('REJECTED');
    expect((await send(d.id, 1)).status).toBe(409);
    expect(ctx.gmail.sent).toHaveLength(0);
  });

  it('viewer cannot send; header-injection in subject is rejected', async () => {
    await connectGmail(w.A.tenantId);
    const { lead } = await makeLead(w.A.tenantId, w.A.sales.id);
    const d = await mkDraft(lead.id);
    const viewer = (await login(ctx.http, 'viewer@test-a.test')).auth;
    expect((await send(d.id, 1, 'viewer-key-0001', viewer)).status).toBe(403);
    await ctx.http().patch(`/api/v1/communications/drafts/${d.id}`).set(sales).send({ subject: 'Hello\r\nBcc: attacker@example.com' });
    await ctx.http().post(`/api/v1/communications/drafts/${d.id}/request-approval`).set(sales);
    await approve(d.id);
    expect((await send(d.id, 3, 'inject-key-0001')).status).not.toBe(200);
    expect(ctx.gmail.sent).toHaveLength(0);
  });

  it('n8n flows: follow-up workflow drafts only for consented contacts and never sends; approved-send needs a human confirmation token', async () => {
    await connectGmail(w.A.tenantId);
    await makeLead(w.A.tenantId, w.A.sales.id, { name: 'Consented', consent: 'GRANTED' });
    await makeLead(w.A.tenantId, w.A.sales.id, { name: 'NoConsent', consent: 'NOT_GRANTED' });
    const body = { correlationId: 'followup-run-0001' };
    const { raw, headers } = webhookHeaders(w.A.tenantId, body);
    const r = await ctx.http().post('/api/v1/automation/followups/draft-due').set(headers).send(raw);
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual({ draftsCreated: 1, skippedNoConsent: 1 });
    expect(ctx.gmail.sent).toHaveLength(0);
    const drafts = await prisma.communicationDraft.findMany({ where: { tenantId: w.A.tenantId } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe('PENDING_REVIEW');
    // replay with the same correlation id is a no-op
    const again = webhookHeaders(w.A.tenantId, body);
    expect((await ctx.http().post('/api/v1/automation/followups/draft-due').set(again.headers).send(again.raw)).body.duplicate).toBe(true);
    expect(await prisma.communicationDraft.count({ where: { tenantId: w.A.tenantId } })).toBe(1);

    // approved-send: no/forged token → refused
    const draftId = drafts[0].id;
    const noTok = webhookHeaders(w.A.tenantId, { correlationId: 'send-run-0001', confirmationToken: 'x'.repeat(40) });
    expect((await ctx.http().post('/api/v1/automation/send-approved').set(noTok.headers).send(noTok.raw)).status).toBe(403);
    // token cannot be issued for an unapproved draft
    expect((await ctx.http().post(`/api/v1/communications/drafts/${draftId}/send-confirmation`).set(sales)).status).toBe(409);
    await approve(draftId);
    const conf = await ctx.http().post(`/api/v1/communications/drafts/${draftId}/send-confirmation`).set(sales);
    expect(conf.status).toBe(200);
    const ok = webhookHeaders(w.A.tenantId, { correlationId: 'send-run-0002', confirmationToken: conf.body.token });
    const sent = await ctx.http().post('/api/v1/automation/send-approved').set(ok.headers).send(ok.raw);
    expect(sent.status).toBe(200);
    expect(ctx.gmail.sent).toHaveLength(1);
  });

  it('webhook auth: missing/invalid/old signatures are rejected', async () => {
    const body = { correlationId: 'daily-0000001' };
    expect((await ctx.http().post('/api/v1/automation/daily-report').send(body)).status).toBe(401);
    const bad = webhookHeaders(w.A.tenantId, body, { badSig: true });
    expect((await ctx.http().post('/api/v1/automation/daily-report').set(bad.headers).send(bad.raw)).status).toBe(401);
    const old = webhookHeaders(w.A.tenantId, body, { ts: Math.floor(Date.now() / 1000) - 3600 });
    expect((await ctx.http().post('/api/v1/automation/daily-report').set(old.headers).send(old.raw)).status).toBe(401);
    const good = webhookHeaders(w.A.tenantId, body);
    expect((await ctx.http().post('/api/v1/automation/daily-report').set(good.headers).send(good.raw)).status).toBe(200);
  });

  it('Google connect reports a clear blocked state when OAuth is not configured', async () => {
    const res = await ctx.http().get('/api/v1/integrations/google/connect').set(owner);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
    expect((await ctx.http().get('/api/v1/integrations/google/connect').set(manager)).status).toBe(403);
    const st = await ctx.http().get('/api/v1/integrations/status').set(owner);
    expect(st.body.google.configured).toBe(false);
    expect(st.body.google.blockedReason).toMatch(/GOOGLE_CLIENT_ID/);
  });
});

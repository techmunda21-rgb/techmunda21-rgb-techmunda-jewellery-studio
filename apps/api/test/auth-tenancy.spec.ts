import { prisma } from '@techmunda/database';
import { createApp, login, makeLead, makeProduct, PASSWORD, pngBuffer, resetWorld, uploadImage, type World } from './helpers';

describe('authentication, authorization and tenant isolation', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => { w = await resetWorld(); });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  it('login succeeds with valid credentials and returns tokens (no password hash)', async () => {
    const res = await ctx.http().post('/api/v1/auth/login').send({ email: w.A.owner.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
  });

  it('login fails identically for a wrong password and an unknown user', async () => {
    const bad = await ctx.http().post('/api/v1/auth/login').send({ email: w.A.owner.email, password: 'nope' });
    const unknown = await ctx.http().post('/api/v1/auth/login').send({ email: 'ghost@nowhere.test', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unauthenticated and garbage-token requests', async () => {
    expect((await ctx.http().get('/api/v1/products')).status).toBe(401);
    expect((await ctx.http().get('/api/v1/leads').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
  });

  it('refresh rotates tokens and reuse of an old token revokes the family', async () => {
    const { refreshToken } = await login(ctx.http, w.A.owner.email);
    const r1 = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(refreshToken);
    const reuse = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSED');
    const afterRevoke = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(afterRevoke.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await login(ctx.http, w.A.owner.email);
    await ctx.http().post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
    expect((await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  it('a disabled user is locked out even with a still-valid access token', async () => {
    const { auth } = await login(ctx.http, w.A.sales.email);
    await prisma.user.update({ where: { id: w.A.sales.id }, data: { status: 'DISABLED' } });
    expect((await ctx.http().get('/api/v1/leads').set(auth)).status).toBe(401);
  });

  it('VIEWER is read-only; role allow-lists are enforced', async () => {
    const viewer = await login(ctx.http, w.A.viewer.email);
    expect((await ctx.http().get('/api/v1/products').set(viewer.auth)).status).toBe(200);
    expect((await ctx.http().post('/api/v1/products').set(viewer.auth).send({ sku: 'V-1', name: 'x y', category: 'Ring' })).status).toBe(403);
    const sales = await login(ctx.http, w.A.sales.email);
    expect((await ctx.http().post('/api/v1/products').set(sales.auth).send({ sku: 'S-1', name: 'x y', category: 'Ring' })).status).toBe(403);
  });

  it('Tenant A cannot read or modify Tenant B data (products, media, leads, drafts, assets)', async () => {
    const a = await login(ctx.http, w.A.owner.email);
    const b = await login(ctx.http, w.B.owner.email);
    const prodB = await makeProduct(ctx.http, b.auth, 'B-001');
    const img = await pngBuffer();
    const upB = await uploadImage(ctx.http, b.auth, prodB.id, img);
    const mediaB = upB.confirm!.body.id as string;
    const { lead: leadB } = await makeLead(w.B.tenantId, w.B.owner.id);
    const draftB = await ctx.http().post('/api/v1/communications/drafts').set(b.auth).send({ leadId: leadB.id, generate: true });
    expect(draftB.status).toBe(201);

    // reads → 404 (not 403: existence is not revealed)
    expect((await ctx.http().get(`/api/v1/products/${prodB.id}`).set(a.auth)).status).toBe(404);
    expect((await ctx.http().get(`/api/v1/media/${mediaB}`).set(a.auth)).status).toBe(404);
    expect((await ctx.http().get(`/api/v1/leads/${leadB.id}`).set(a.auth)).status).toBe(404);
    expect((await ctx.http().get(`/api/v1/communications/drafts/${draftB.body.id}`).set(a.auth)).status).toBe(404);
    // writes
    expect((await ctx.http().patch(`/api/v1/products/${prodB.id}`).set(a.auth).send({ name: 'hacked' })).status).toBe(404);
    expect((await ctx.http().delete(`/api/v1/products/${prodB.id}`).set(a.auth)).status).toBe(404);
    expect((await ctx.http().patch(`/api/v1/leads/${leadB.id}`).set(a.auth).send({ status: 'WON' })).status).toBe(404);
    expect((await ctx.http().post(`/api/v1/communications/drafts/${draftB.body.id}/approve`).set(a.auth).send({})).status).toBe(404);
    // creating things that reference B's records
    expect((await ctx.http().post('/api/v1/media/upload-url').set(a.auth).send({ productId: prodB.id, fileName: 'x.png', mimeType: 'image/png', fileSize: 10, rightsConfirmed: true })).status).toBe(404);
    expect((await ctx.http().post('/api/v1/communications/drafts').set(a.auth).send({ leadId: leadB.id, generate: true })).status).toBe(404);
    // lists never include B's rows
    const list = await ctx.http().get('/api/v1/products').set(a.auth);
    expect(list.body.data.find((p: any) => p.id === prodB.id)).toBeUndefined();
    const leads = await ctx.http().get('/api/v1/leads').set(a.auth);
    expect(leads.body.data.find((l: any) => l.id === leadB.id)).toBeUndefined();
    // B's data still intact
    expect((await ctx.http().get(`/api/v1/products/${prodB.id}`).set(b.auth)).body.name).toBe('Test Necklace');
  });

  it('a browser-supplied tenant id is ignored (tenant always comes from the token)', async () => {
    const a = await login(ctx.http, w.A.owner.email);
    const res = await ctx.http().post('/api/v1/products').set(a.auth).send({ sku: 'X-1', name: 'Spoof Test', category: 'Ring', tenantId: w.B.tenantId });
    expect(res.status).toBe(201);
    const row = await prisma.product.findFirstOrThrow({ where: { id: res.body.id } });
    expect(row.tenantId).toBe(w.A.tenantId);
  });

  it('same SKU can exist in two tenants but not twice in one', async () => {
    const a = await login(ctx.http, w.A.owner.email);
    const b = await login(ctx.http, w.B.owner.email);
    expect((await ctx.http().post('/api/v1/products').set(a.auth).send({ sku: 'DUP-1', name: 'One Two', category: 'Ring' })).status).toBe(201);
    expect((await ctx.http().post('/api/v1/products').set(b.auth).send({ sku: 'DUP-1', name: 'One Two', category: 'Ring' })).status).toBe(201);
    expect((await ctx.http().post('/api/v1/products').set(a.auth).send({ sku: 'DUP-1', name: 'One Two', category: 'Ring' })).status).toBe(409);
  });

  it('automation webhook secrets are per tenant', async () => {
    const { webhookHeaders } = await import('./helpers');
    const body = { correlationId: 'corr-12345678' };
    const { raw, headers } = webhookHeaders(w.A.tenantId, body, { secretTenantId: w.B.tenantId });
    expect((await ctx.http().post('/api/v1/automation/daily-report').set(headers).send(raw)).status).toBe(401);
  });
});

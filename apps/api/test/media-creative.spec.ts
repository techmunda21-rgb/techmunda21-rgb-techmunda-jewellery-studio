import { prisma } from '@techmunda/database';
import { ENV, STORAGE } from '../src/common/tokens';
import { createApp, login, makeProduct, pngBuffer, resetWorld, uploadImage, type World } from './helpers';

describe('media upload and creative studio', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  let auth: Record<string, string>;
  let productId: string;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => {
    w = await resetWorld();
    auth = (await login(ctx.http, w.A.designer.email)).auth;
    productId = (await makeProduct(ctx.http, auth)).id;
  });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  it('accepts a valid image, stores checksum/dimensions and returns a signed view URL', async () => {
    const r = await uploadImage(ctx.http, auth, productId, await pngBuffer());
    expect(r.put!.status).toBe(204);
    expect(r.confirm!.status).toBe(201);
    expect(r.confirm!.body).toMatchObject({ width: 400, height: 300, mimeType: 'image/png', rightsConfirmed: true });
    expect(r.confirm!.body.checksum).toHaveLength(64);
    const img = await ctx.http().get(new URL(r.confirm!.body.url).pathname);
    expect(img.status).toBe(200);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects an invalid image (text renamed .png)', async () => {
    const r = await uploadImage(ctx.http, auth, productId, Buffer.from('<script>alert(1)</script> definitely not a png'));
    expect(r.confirm!.status).toBe(422);
    expect(r.confirm!.body.error.code).toBe('INVALID_IMAGE');
    expect(await prisma.productMedia.count({ where: { productId } })).toBe(0);
  });

  it('rejects content that does not match the declared MIME type', async () => {
    const jpeg = await (await import('sharp')).default({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const r = await uploadImage(ctx.http, auth, productId, jpeg, 'image/png');
    expect(r.confirm!.status).toBe(422);
    expect(r.confirm!.body.error.code).toBe('MIME_MISMATCH');
  });

  it('rejects unsupported types and oversized declarations up front', async () => {
    const gif = await ctx.http().post('/api/v1/media/upload-url').set(auth).send({ productId, fileName: 'a.gif', mimeType: 'image/gif', fileSize: 100, rightsConfirmed: true });
    expect(gif.status).toBe(400);
    const big = await ctx.http().post('/api/v1/media/upload-url').set(auth).send({ productId, fileName: 'a.png', mimeType: 'image/png', fileSize: 11 * 1024 * 1024, rightsConfirmed: true });
    expect(big.status).toBe(400);
    expect(JSON.stringify(big.body)).toMatch(/10 MB/);
  });

  it('rejects an oversized body even when the declared size was small', async () => {
    const up = await ctx.http().post('/api/v1/media/upload-url').set(auth).send({ productId, fileName: 'a.png', mimeType: 'image/png', fileSize: 1000, rightsConfirmed: true });
    const put = await ctx.http().put(new URL(up.body.uploadUrl).pathname).set('Content-Type', 'image/png').send(Buffer.alloc(200_000, 1));
    expect(put.status).toBe(413);
  });

  it('requires the client-authorisation confirmation and rejects tampered upload tokens', async () => {
    const noRights = await ctx.http().post('/api/v1/media/upload-url').set(auth).send({ productId, fileName: 'a.png', mimeType: 'image/png', fileSize: 100, rightsConfirmed: false });
    expect(noRights.status).toBe(400);
    const tampered = await ctx.http().put('/api/v1/media/upload/abc.def').set('Content-Type', 'image/png').send(Buffer.from('x'));
    expect(tampered.status).toBe(403);
  });

  async function newJob(extra: Record<string, unknown> = {}) {
    const up = await uploadImage(ctx.http, auth, productId, await pngBuffer());
    return ctx.http().post('/api/v1/creatives/jobs').set(auth).send({ productId, sourceMediaId: up.confirm!.body.id, style: 'diwali_festive', aspectRatio: '4:5', variations: 2, ...extra });
  }

  it('runs a creative job on the clearly-labelled simulation adapter and keeps provenance', async () => {
    const res = await newJob();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'COMPLETED', provider: 'demo-simulation', simulated: true, style: 'diwali_festive', aspectRatio: '4:5' });
    expect(res.body.assets).toHaveLength(2);
    expect(res.body.assets[0]).toMatchObject({ reviewStatus: 'DRAFT', simulated: true });
    expect(res.body.assets[0].accuracyFlags.join(' ')).toMatch(/SIMULATED/);
    expect(res.body.prompt).toMatch(/Do not|do not|Constraint/i);
    expect(res.body.source.id).toBeTruthy();
  });

  it('never exports or attaches unapproved assets; approval needs checklist + proper role', async () => {
    const job = (await newJob()).body;
    const assetId = job.assets[0].id;
    expect((await ctx.http().get(`/api/v1/creatives/assets/${assetId}/export`).set(auth)).status).toBe(409);
    // cannot approve a DRAFT (not submitted)
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/approve`).set(auth).send({ accuracyChecklistConfirmed: true })).status).toBe(409);
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/submit-review`).set(auth)).status).toBe(201);
    // sales cannot approve
    const sales = await login(ctx.http, w.A.sales.email);
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/approve`).set(sales.auth).send({ accuracyChecklistConfirmed: true })).status).toBe(403);
    // checklist required
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/approve`).set(auth).send({})).status).toBe(400);
    // campaigns refuse unapproved
    const camp = await ctx.http().post('/api/v1/campaigns').set(auth).send({ name: 'Diwali Test', campaignType: 'FESTIVE' });
    const attach = await ctx.http().patch(`/api/v1/campaigns/${camp.body.id}`).set(auth).send({ attachAssetIds: [assetId] });
    expect(attach.status).toBe(400);
    expect(attach.body.error.code).toBe('ASSET_NOT_APPROVED');
    // approve → export works, then double-approve is rejected
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/approve`).set(auth).send({ accuracyChecklistConfirmed: true })).status).toBe(201);
    expect((await ctx.http().get(`/api/v1/creatives/assets/${assetId}/export`).set(auth)).status).toBe(200);
    expect((await ctx.http().post(`/api/v1/creatives/assets/${assetId}/approve`).set(auth).send({ accuracyChecklistConfirmed: true })).status).toBe(409);
    expect((await ctx.http().patch(`/api/v1/campaigns/${camp.body.id}`).set(auth).send({ attachAssetIds: [assetId] })).status).toBe(200);
  });

  it('records a failed job (source object missing) with an error message instead of crashing', async () => {
    const up = await uploadImage(ctx.http, auth, productId, await pngBuffer());
    const media = await prisma.productMedia.findFirstOrThrow({ where: { id: up.confirm!.body.id } });
    await ctx.app.get(STORAGE).remove(media.storageKey);
    const res = await ctx.http().post('/api/v1/creatives/jobs').set(auth).send({ productId, sourceMediaId: media.id, style: 'luxury_editorial', aspectRatio: '1:1', variations: 1 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.errorMessage).toBeTruthy();
    expect(res.body.assets).toHaveLength(0);
  });

  it('handles missing AI credentials: AI_MODE=openai without a key returns 503 and creates no job', async () => {
    const env = ctx.app.get(ENV);
    const prev = env.AI_MODE;
    env.AI_MODE = 'openai';
    try {
      const res = await newJob();
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
      expect(await prisma.creativeJob.count({ where: { tenantId: w.A.tenantId } })).toBe(0);
    } finally {
      env.AI_MODE = prev;
    }
  });

  it('refuses a source image from another product / unauthorised role', async () => {
    const up = await uploadImage(ctx.http, auth, productId, await pngBuffer());
    const other = await makeProduct(ctx.http, auth, 'T-002');
    expect((await ctx.http().post('/api/v1/creatives/jobs').set(auth).send({ productId: other.id, sourceMediaId: up.confirm!.body.id, style: 'diwali_festive', aspectRatio: '1:1', variations: 1 })).status).toBe(404);
    const sales = await login(ctx.http, w.A.sales.email);
    expect((await ctx.http().post('/api/v1/creatives/jobs').set(sales.auth).send({ productId, sourceMediaId: up.confirm!.body.id, style: 'diwali_festive', aspectRatio: '1:1', variations: 1 })).status).toBe(403);
  });
});

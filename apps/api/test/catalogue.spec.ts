import { prisma } from '@techmunda/database';
import { createApp, login, pngBuffer, resetWorld, type World } from './helpers';

describe('catalogue: purity, weights, CSV import and 360° frames', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  let auth: Record<string, string>;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => { w = await resetWorld(); auth = (await login(ctx.http, w.A.manager.email)).auth; });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  const create = (b: Record<string, unknown>) => ctx.http().post('/api/v1/products').set(auth).send({ sku: 'P-1', name: 'Test Piece', category: 'Necklace', ...b });

  it('canonicalises purity, derives hallmark fineness and pure-gold grams from the entered weight only', async () => {
    const r = await create({ metalType: 'Gold', purity: '22 karat', weight: 50 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ purity: '22K', purityLabel: '22K', fineness: 916, pureMetalGrams: 45.8, weight: 50 });
    const r2 = await create({ sku: 'P-2', metalType: 'Gold', purity: '750', weight: 10.5 });
    expect(r2.body).toMatchObject({ purityLabel: '18K', fineness: 750, pureMetalGrams: 7.875 });
    const none = await create({ sku: 'P-3', metalType: 'Gold', purity: '18K' });
    expect(none.body.pureMetalGrams).toBeNull(); // no weight entered ⇒ nothing is invented
  });

  it('rejects impossible purities and non-positive weights', async () => {
    expect((await create({ metalType: 'Gold', purity: '23K' })).status).toBe(400);
    expect((await create({ sku: 'P-9', metalType: 'Gold', purity: 'pure gold!!' })).status).toBe(400);
    expect((await create({ sku: 'P-8', metalType: 'Silver', purity: '22K' })).status).toBe(400);
    expect((await create({ sku: 'P-7', metalType: 'Gold', purity: '22K', weight: 0 })).status).toBe(400);
    expect((await create({ sku: 'P-6', metalType: 'Platinum', purity: '950', weight: 6 })).body.purityLabel).toBe('Pt 950');
  });

  const CSV = 'sku,name,category,metal,purity,stones,weight_g,price,availability\n'
    + 'NK-1,Heritage Necklace,Necklace,Gold,22K,Emerald,78.5,"4,85,000",IN_STOCK\n'
    + 'BG-1,Temple Bangles,Bangles,Gold,23K,,64,312000,MADE_TO_ORDER\n'
    + 'RG-1,Solitaire Ring,Ring,Gold,18K,Diamond,5.8,235000,in stock\n'
    + 'NK-1,Dup In File,Necklace,Gold,22K,,10,1000,IN_STOCK\n';

  it('CSV import: previews problems and duplicates, then commits only valid rows; existing SKUs need explicit update', async () => {
    const prev = await ctx.http().post('/api/v1/products/import/preview').set(auth).send({ csv: CSV });
    expect(prev.status).toBe(201);
    expect(prev.body.summary).toMatchObject({ total: 4, importable: 2, invalid: 1 });
    const bad = prev.body.rows.find((r: any) => r.sku === 'BG-1');
    expect(bad.problems.join(' ')).toMatch(/not a recognised gold purity/);
    const nk = prev.body.rows[0];
    expect(nk).toMatchObject({ price: 485000, fineness: 916, pureMetalGrams: 71.906 });
    expect(await prisma.product.count({ where: { tenantId: w.A.tenantId } })).toBe(0); // preview inserts nothing

    const rows = prev.body.rows.filter((r: any) => r.importable && !r.duplicate);
    const commit = await ctx.http().post('/api/v1/products/import/commit').set(auth).send({ rows });
    expect(commit.body).toEqual({ created: 2, updated: 0, skipped: 0 });
    const again = await ctx.http().post('/api/v1/products/import/commit').set(auth).send({ rows });
    expect(again.body).toEqual({ created: 0, updated: 0, skipped: 2 });
    const upd = await ctx.http().post('/api/v1/products/import/commit').set(auth).send({ rows: [{ ...rows[0], price: 500000 }], updateExisting: true });
    expect(upd.body).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(Number((await prisma.product.findFirstOrThrow({ where: { tenantId: w.A.tenantId, sku: 'NK-1' } })).price)).toBe(500000);
  });

  it('CSV import is role-restricted and tenant-scoped', async () => {
    const sales = (await login(ctx.http, w.A.sales.email)).auth;
    expect((await ctx.http().post('/api/v1/products/import/preview').set(sales).send({ csv: CSV })).status).toBe(403);
    const b = (await login(ctx.http, w.B.owner.email)).auth;
    const prev = await ctx.http().post('/api/v1/products/import/preview').set(b).send({ csv: CSV });
    const commit = await ctx.http().post('/api/v1/products/import/commit').set(b).send({ rows: prev.body.rows.filter((r: any) => r.importable && !r.duplicate) });
    expect(commit.body.created).toBe(2);
    expect(await prisma.product.count({ where: { tenantId: w.A.tenantId } })).toBe(0);
  });

  it('360° frames are stored ordered, kept out of thumbnails, and returned as a spin set', async () => {
    const p = (await create({ metalType: 'Gold', purity: '22K', weight: 20 })).body;
    const frames = [2, 0, 1];
    for (const order of frames) {
      const buf = await pngBuffer(['#aa2222', '#22aa22', '#2222aa'][order]);
      const up = await ctx.http().post('/api/v1/media/upload-url').set(auth).send({ productId: p.id, fileName: 'f.png', mimeType: 'image/png', fileSize: buf.length, rightsConfirmed: true, kind: 'SPIN_FRAME', sortOrder: order });
      expect(up.status).toBe(201);
      await ctx.http().put(new URL(up.body.uploadUrl).pathname).set('Content-Type', 'image/png').send(buf);
      const c = await ctx.http().post('/api/v1/media/confirm').set(auth).send({ uploadToken: up.body.uploadToken });
      expect(c.body).toMatchObject({ mediaKind: 'SPIN_FRAME', sortOrder: order });
    }
    const detail = (await ctx.http().get(`/api/v1/products/${p.id}`).set(auth)).body;
    expect(detail.media.map((m: any) => m.sortOrder)).toEqual([0, 1, 2]);
    expect(detail.media.every((m: any) => m.mediaKind === 'SPIN_FRAME')).toBe(true);
    const list = (await ctx.http().get('/api/v1/products').set(auth)).body.data.find((x: any) => x.id === p.id);
    expect(list.thumbnailUrl).toBeNull(); // frames never become the catalogue thumbnail
  });
});

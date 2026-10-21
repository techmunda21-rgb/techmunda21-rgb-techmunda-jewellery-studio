import { PDFDocument } from 'pdf-lib';
import { prisma } from '@techmunda/database';
import { createApp, login, resetWorld, type World } from './helpers';

async function pdf(pages = 3, extra?: (d: PDFDocument) => void) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`Design page ${i + 1}`, { x: 50, y: 780 });
  extra?.(d);
  return Buffer.from(await d.save());
}

describe('dashboard showcase PDF', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  let mgr: Record<string, string>;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => { w = await resetWorld(); mgr = (await login(ctx.http, w.A.manager.email)).auth; });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  const put = (auth: Record<string, string>, body: Buffer | string, title = 'Diwali Lookbook', type = 'application/pdf') =>
    ctx.http().put(`/api/v1/showcase?title=${encodeURIComponent(title)}`).set(auth).set('Content-Type', type).send(body as any);

  it('accepts a valid PDF, records the page count and serves it back inline as application/pdf', async () => {
    const r = await put(mgr, await pdf(4));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: 'Diwali Lookbook', pageCount: 4, isActive: true });
    const file = await ctx.http().get(new URL(r.body.url).pathname).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/application\/pdf/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['x-frame-options']).toBeUndefined();
    expect(file.headers['content-security-policy']).toMatch(/frame-ancestors 'self' http/);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('a new upload becomes the active showcase; older ones can be re-activated or deleted', async () => {
    const a = (await put(mgr, await pdf(1), 'A')).body;
    const b = (await put(mgr, await pdf(2), 'B')).body;
    let list = (await ctx.http().get('/api/v1/showcase').set(mgr)).body.data;
    expect(list.find((x: any) => x.id === b.id).isActive).toBe(true);
    expect(list.find((x: any) => x.id === a.id).isActive).toBe(false);
    await ctx.http().post(`/api/v1/showcase/${a.id}/activate`).set(mgr).expect(200);
    list = (await ctx.http().get('/api/v1/showcase').set(mgr)).body.data;
    expect(list.filter((x: any) => x.isActive).map((x: any) => x.title)).toEqual(['A']);
    await ctx.http().delete(`/api/v1/showcase/${b.id}`).set(mgr).expect(204);
  });

  it('rejects non-PDFs, corrupt PDFs, active content and oversized bodies', async () => {
    expect((await put(mgr, Buffer.from('<html>not a pdf</html>'))).body.error.code).toBe('NOT_A_PDF');
    expect((await put(mgr, Buffer.from('%PDF-1.7\n garbage garbage'))).body.error.code).toBe('INVALID_PDF');
    const evil = await pdf(1, (d) => { d.catalog.set(d.context.obj('OpenAction') as any, d.context.obj({ S: 'JavaScript', JS: 'app.alert(1)' })); });
    const r = await put(mgr, evil);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('ACTIVE_CONTENT');
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(26 * 1024 * 1024, 32)]);
    expect((await put(mgr, big)).status).toBe(413);
    expect(await prisma.showcaseDocument.count({ where: { tenantId: w.A.tenantId } })).toBe(0);
  });

  it('enforces roles and tenant isolation', async () => {
    const viewer = (await login(ctx.http, w.A.viewer.email)).auth;
    const sales = (await login(ctx.http, w.A.sales.email)).auth;
    expect((await put(viewer, await pdf(1))).status).toBe(403);
    expect((await put(sales, await pdf(1))).status).toBe(403);
    const doc = (await put(mgr, await pdf(1))).body;
    expect((await ctx.http().get('/api/v1/showcase').set(viewer)).body.data).toHaveLength(1); // viewers can see it
    const b = (await login(ctx.http, w.B.owner.email)).auth;
    expect((await ctx.http().get('/api/v1/showcase').set(b)).body.data).toHaveLength(0);
    expect((await ctx.http().delete(`/api/v1/showcase/${doc.id}`).set(b)).status).toBe(404);
    expect((await ctx.http().post(`/api/v1/showcase/${doc.id}/activate`).set(b)).status).toBe(404);
  });
});

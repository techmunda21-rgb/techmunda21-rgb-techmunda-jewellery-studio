import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { metalFamily, paginationSchema, parsePurity, productImportCommitSchema, productInputSchema, productUpdateSchema, pureMetalGrams, csvImportPreviewSchema, type ProductInput } from '@techmunda/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { found, num, pageArgs, paged } from '../common/helpers';
import { PRISMA, STORAGE, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { MediaUrlService } from '../media/media-url.service';
import { parseCsv } from '../common/csv';

const listQuery = paginationSchema.extend({ category: z.string().max(80).optional() });
const WRITE = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'] as const;

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaDb,
    @Inject(STORAGE) private readonly storage: AppStorage,
    private readonly urls: MediaUrlService,
    private readonly audit: AuditService,
  ) {}

  /** Canonical purity label, hallmark fineness and pure-metal grams — all derived from catalogue facts only. */
  private purityInfo(p: any) {
    const info = parsePurity(p.metalType, p.purity);
    const w = p.weight != null ? Number(p.weight) : null;
    return { purityLabel: info?.label ?? p.purity ?? null, fineness: info?.fineness ?? null, pureMetalGrams: pureMetalGrams(w, info?.fineness), metalFamily: metalFamily(p.metalType) };
  }

  /** Store purity in canonical form (e.g. "22 karat" → "22K") so reports and PDFs are consistent. */
  private canon<T extends { metalType?: string | null; purity?: string | null }>(b: T): T {
    const info = parsePurity(b.metalType, b.purity);
    return info ? { ...b, purity: info.label } : b;
  }

  private async shape(tenantId: string, p: any) {
    const original = p.media?.[0];
    return {
      id: p.id, sku: p.sku, name: p.name, category: p.category, description: p.description,
      metalType: p.metalType, purity: p.purity, stoneType: p.stoneType, weight: num(p.weight), price: num(p.price),
      currency: p.currency, availability: p.availability, createdAt: p.createdAt, updatedAt: p.updatedAt,
      ...this.purityInfo(p),
      mediaCount: p._count?.media ?? p.media?.length ?? 0,
      thumbnailUrl: original ? await this.urls.viewUrl(tenantId, original.storageKey, original.mimeType) : null,
    };
  }

  @Get()
  @Doc('List products (tenant-scoped, paginated)')
  async list(@CurrentUser() user: AuthUser, @Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    const where: any = { tenantId: user.tenantId };
    if (q.category) where.category = q.category;
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }, { category: { contains: q.q, mode: 'insensitive' } }];
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q.page, q.pageSize), include: { _count: { select: { media: true } }, media: { where: { isOriginal: true, mediaKind: 'PHOTO' }, orderBy: { createdAt: 'asc' }, take: 1 } } }),
      this.prisma.product.count({ where }),
    ]);
    return paged(await Promise.all(rows.map((r) => this.shape(user.tenantId, r))), total, q.page, q.pageSize);
  }

  @Post()
  @Roles(...WRITE)
  @Doc('Create a product', productInputSchema)
  async create(@CurrentUser() user: AuthUser, @Body(zod(productInputSchema)) body: ProductInput) {
    const p = await this.prisma.product.create({ data: { ...this.canon(body), tenantId: user.tenantId } });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'product.created', resourceType: 'product', resourceId: p.id });
    return this.shape(user.tenantId, p);
  }

  /** Validates a catalogue CSV (purity standards, weights, prices, duplicate SKUs). Inserts nothing. */
  @Post('import/preview')
  @Roles(...WRITE)
  @Doc('Preview a catalogue CSV import', csvImportPreviewSchema)
  async importPreview(@CurrentUser() user: AuthUser, @Body(zod(csvImportPreviewSchema)) b: { csv: string }) {
    const rows = parseCsv(b.csv);
    if (!rows.length) throw new BadRequestException({ code: 'EMPTY_CSV', message: 'No data rows. Required columns: sku, name, category. See the template.' });
    if (rows.length > 500) throw new BadRequestException({ code: 'CSV_TOO_LARGE', message: 'Import at most 500 products at a time' });
    const existing = new Set((await this.prisma.product.findMany({ where: { tenantId: user.tenantId }, select: { sku: true } })).map((p) => p.sku.toLowerCase()));
    const seen = new Set<string>();
    const out = rows.map((r, i) => {
      const num = (v?: string) => (v == null || v.trim() === '' ? null : Number(v.replace(/[,₹\s]/g, '')));
      const cand = {
        sku: r.sku?.trim() ?? '', name: r.name?.trim() ?? '', category: r.category?.trim() ?? '', description: r.description?.trim() || null,
        metalType: (r.metal ?? r.metal_type)?.trim() || null, purity: r.purity?.trim() || null, stoneType: (r.stones ?? r.stone_type)?.trim() || null,
        weight: num(r.weight_g ?? r.weight), price: num(r.price), currency: (r.currency?.trim() || 'INR').toUpperCase(),
        availability: ((r.availability ?? 'IN_STOCK').trim().toUpperCase().replace(/[\s-]+/g, '_') || 'IN_STOCK'),
      };
      const parsed = productInputSchema.safeParse(cand);
      const problems = parsed.success ? [] : parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`);
      if (cand.weight != null && Number.isNaN(cand.weight)) problems.push('weight_g: not a number');
      if (cand.price != null && Number.isNaN(cand.price)) problems.push('price: not a number');
      const key = cand.sku.toLowerCase();
      const duplicate: 'existing' | 'file' | null = existing.has(key) ? 'existing' : seen.has(key) ? 'file' : null;
      seen.add(key);
      const info = parsePurity(cand.metalType, cand.purity);
      return { row: i + 2, ...cand, purityLabel: info?.label ?? cand.purity, fineness: info?.fineness ?? null, pureMetalGrams: pureMetalGrams(cand.weight, info?.fineness), problems, duplicate, importable: problems.length === 0 && duplicate !== 'file' };
    });
    return { rows: out, summary: { total: out.length, importable: out.filter((r) => r.importable && !r.duplicate).length, updatable: out.filter((r) => r.importable && r.duplicate === 'existing').length, invalid: out.filter((r) => r.problems.length).length } };
  }

  @Post('import/commit')
  @Roles(...WRITE)
  @Doc('Insert (and optionally update) reviewed catalogue rows', productImportCommitSchema)
  async importCommit(@CurrentUser() user: AuthUser, @Body(zod(productImportCommitSchema)) b: { rows: any[]; updateExisting: boolean }) {
    let created = 0, updated = 0, skipped = 0;
    for (const raw of b.rows) {
      const parsed = productInputSchema.safeParse(raw);
      if (!parsed.success) { skipped++; continue; }
      const data = this.canon(parsed.data);
      const existing = await this.prisma.product.findFirst({ where: { tenantId: user.tenantId, sku: data.sku }, select: { id: true } });
      if (existing && !b.updateExisting) { skipped++; continue; }
      if (existing) { await this.prisma.product.update({ where: { id: existing.id }, data }); updated++; }
      else { await this.prisma.product.create({ data: { ...data, tenantId: user.tenantId } }); created++; }
    }
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'products.csv_imported', resourceType: 'product', metadata: { created, updated, skipped } });
    return { created, updated, skipped };
  }

  @Get(':id')
  @Doc('Get a product with its media')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = found(await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, include: { media: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, _count: { select: { media: true } } } }), 'Product');
    const media = await Promise.all(p.media.map(async (m) => ({ id: m.id, mediaKind: m.mediaKind, sortOrder: m.sortOrder, mimeType: m.mimeType, fileSize: m.fileSize, width: m.width, height: m.height, isOriginal: m.isOriginal, createdAt: m.createdAt, url: await this.urls.viewUrl(user.tenantId, m.storageKey, m.mimeType) })));
    return { ...(await this.shape(user.tenantId, p)), media };
  }

  @Patch(':id')
  @Roles(...WRITE)
  @Doc('Update a product', productUpdateSchema)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(productUpdateSchema)) body: Partial<ProductInput>) {
    found(await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Product');
    const p = await this.prisma.product.update({ where: { id }, data: this.canon(body) });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'product.updated', resourceType: 'product', resourceId: id, metadata: { fields: Object.keys(body) } });
    return this.shape(user.tenantId, p);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER')
  @Doc('Delete a product and its media')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = found(await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, include: { media: true, jobs: { include: { assets: true } } } }), 'Product');
    await this.prisma.product.delete({ where: { id } });
    const keys = [...p.media.map((m) => m.storageKey), ...p.jobs.flatMap((j) => j.assets.map((a) => a.storageKey))];
    await Promise.allSettled(keys.map((k) => this.storage.remove(k)));
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'product.deleted', resourceType: 'product', resourceId: id });
  }
}

import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationSchema, productInputSchema, productUpdateSchema, type ProductInput } from '@techmunda/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { found, num, pageArgs, paged } from '../common/helpers';
import { PRISMA, STORAGE, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { MediaUrlService } from '../media/media-url.service';

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

  private async shape(tenantId: string, p: any) {
    const original = p.media?.[0];
    return {
      id: p.id, sku: p.sku, name: p.name, category: p.category, description: p.description,
      metalType: p.metalType, purity: p.purity, stoneType: p.stoneType, weight: num(p.weight), price: num(p.price),
      currency: p.currency, availability: p.availability, createdAt: p.createdAt, updatedAt: p.updatedAt,
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
      this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q.page, q.pageSize), include: { _count: { select: { media: true } }, media: { where: { isOriginal: true }, orderBy: { createdAt: 'asc' }, take: 1 } } }),
      this.prisma.product.count({ where }),
    ]);
    return paged(await Promise.all(rows.map((r) => this.shape(user.tenantId, r))), total, q.page, q.pageSize);
  }

  @Post()
  @Roles(...WRITE)
  @Doc('Create a product', productInputSchema)
  async create(@CurrentUser() user: AuthUser, @Body(zod(productInputSchema)) body: ProductInput) {
    const p = await this.prisma.product.create({ data: { ...body, tenantId: user.tenantId } });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'product.created', resourceType: 'product', resourceId: p.id });
    return this.shape(user.tenantId, p);
  }

  @Get(':id')
  @Doc('Get a product with its media')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = found(await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, include: { media: { orderBy: { createdAt: 'asc' } }, _count: { select: { media: true } } } }), 'Product');
    const media = await Promise.all(p.media.map(async (m) => ({ id: m.id, mimeType: m.mimeType, fileSize: m.fileSize, width: m.width, height: m.height, isOriginal: m.isOriginal, createdAt: m.createdAt, url: await this.urls.viewUrl(user.tenantId, m.storageKey, m.mimeType) })));
    return { ...(await this.shape(user.tenantId, p)), media };
  }

  @Patch(':id')
  @Roles(...WRITE)
  @Doc('Update a product', productUpdateSchema)
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(productUpdateSchema)) body: Partial<ProductInput>) {
    found(await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } }), 'Product');
    const p = await this.prisma.product.update({ where: { id }, data: body });
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

import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { campaignInputSchema, campaignUpdateSchema } from '@techmunda/shared';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { found, num } from '../common/helpers';
import { PRISMA, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';

const W = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'] as const;

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, private readonly audit: AuditService) {}

  private shape(c: any) {
    return { id: c.id, name: c.name, campaignType: c.campaignType, description: c.description, startDate: c.startDate, endDate: c.endDate, status: c.status, budget: num(c.budget), currency: c.currency, createdAt: c.createdAt,
      assets: (c.assets ?? []).map((a: any) => ({ id: a.generatedAssetId, reviewStatus: a.asset?.reviewStatus })) };
  }

  @Get()
  @Doc('List campaigns')
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.campaign.findMany({ where: { tenantId: u.tenantId }, orderBy: { createdAt: 'desc' }, include: { assets: { include: { asset: { select: { reviewStatus: true } } } } } });
    return { data: rows.map((c) => this.shape(c)) };
  }

  @Post()
  @Roles(...W)
  @Doc('Create a campaign (starts as DRAFT)', campaignInputSchema)
  async create(@CurrentUser() u: AuthUser, @Body(zod(campaignInputSchema)) body: any) {
    const c = await this.prisma.campaign.create({ data: { ...body, tenantId: u.tenantId, status: 'DRAFT' } });
    await this.audit.audit({ tenantId: u.tenantId, actorId: u.id, action: 'campaign.created', resourceType: 'campaign', resourceId: c.id });
    return this.shape(c);
  }

  @Patch(':id')
  @Roles(...W)
  @Doc('Update a campaign, attach approved assets, or change status', campaignUpdateSchema)
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(campaignUpdateSchema)) body: any) {
    found(await this.prisma.campaign.findFirst({ where: { id, tenantId: u.tenantId }, select: { id: true } }), 'Campaign');
    const { attachAssetIds, status, ...rest } = body as { attachAssetIds?: string[]; status?: string; [k: string]: unknown };

    if (attachAssetIds?.length) {
      const assets = await this.prisma.generatedAsset.findMany({ where: { id: { in: attachAssetIds }, tenantId: u.tenantId } });
      if (assets.length !== new Set(attachAssetIds).size) throw new BadRequestException({ code: 'ASSET_NOT_FOUND', message: 'One or more assets do not exist' });
      const unapproved = assets.filter((a) => a.reviewStatus !== 'APPROVED');
      if (unapproved.length) throw new BadRequestException({ code: 'ASSET_NOT_APPROVED', message: 'Only approved assets can be attached to a campaign' });
      await this.prisma.campaignAsset.createMany({ data: assets.map((a) => ({ tenantId: u.tenantId, campaignId: id, generatedAssetId: a.id })), skipDuplicates: true });
    }
    if (status === 'ACTIVE' || status === 'READY') {
      const attached = await this.prisma.campaignAsset.findMany({ where: { campaignId: id, tenantId: u.tenantId }, include: { asset: true } });
      if (attached.some((a) => a.asset.reviewStatus !== 'APPROVED')) throw new BadRequestException({ code: 'ASSET_NOT_APPROVED', message: 'Unapproved assets block publishing' });
      if (status === 'ACTIVE' && !['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER'].includes(u.role)) throw new BadRequestException({ code: 'FORBIDDEN_STATUS', message: 'Only owners or managers can activate a campaign' });
    }
    const c = await this.prisma.campaign.update({ where: { id }, data: { ...(rest as any), ...(status ? { status: status as any } : {}) }, include: { assets: { include: { asset: { select: { reviewStatus: true } } } } } });
    await this.audit.audit({ tenantId: u.tenantId, actorId: u.id, action: 'campaign.updated', resourceType: 'campaign', resourceId: id, metadata: { status: status ?? null } });
    return this.shape(c);
  }
}

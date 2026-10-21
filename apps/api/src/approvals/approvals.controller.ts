import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Doc } from '../common/decorators';
import { PRISMA, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { CommunicationsService } from '../communications/communications.service';
import { CreativesService } from '../creatives/creatives.service';
import { MediaUrlService } from '../media/media-url.service';

@ApiTags('Approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, private readonly creatives: CreativesService, private readonly comms: CommunicationsService, private readonly urls: MediaUrlService) {}

  /** Unified queue of everything waiting for a human decision (creative assets + email drafts). */
  @Get()
  @Doc('Approval queue (default: pending)')
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    const st = (['PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(status ?? '') ? status : 'PENDING_REVIEW') as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    const reqs = await this.prisma.approvalRequest.findMany({ where: { tenantId: u.tenantId, status: st }, orderBy: { createdAt: 'desc' }, take: 60 });
    const assetIds = reqs.filter((r) => r.resourceType === 'GENERATED_ASSET').map((r) => r.resourceId);
    const draftIds = reqs.filter((r) => r.resourceType === 'COMMUNICATION_DRAFT').map((r) => r.resourceId);
    const [assets, drafts] = await Promise.all([
      this.prisma.generatedAsset.findMany({ where: { id: { in: assetIds }, tenantId: u.tenantId }, include: { job: { include: { product: { select: { name: true, sku: true } }, source: true } } } }),
      this.prisma.communicationDraft.findMany({ where: { id: { in: draftIds }, tenantId: u.tenantId }, include: { lead: { include: { contact: true } } } }),
    ]);
    const items = await Promise.all(
      reqs.map(async (r) => {
        if (r.resourceType === 'GENERATED_ASSET') {
          const a = assets.find((x) => x.id === r.resourceId);
          if (!a) return null;
          return { requestId: r.id, type: 'ASSET', status: r.status, createdAt: r.createdAt, reviewNotes: r.reviewNotes, asset: { ...(await this.creatives.assetView(u.tenantId, a)), productName: a.job.product.name, style: a.job.style, prompt: a.job.prompt, provider: a.job.provider, sourceUrl: await this.urls.viewUrl(u.tenantId, a.job.source.storageKey, a.job.source.mimeType) } };
        }
        const d = drafts.find((x) => x.id === r.resourceId);
        if (!d) return null;
        return { requestId: r.id, type: 'EMAIL', status: r.status, createdAt: r.createdAt, reviewNotes: r.reviewNotes, draft: await this.comms.get(u, d.id) };
      }),
    );
    return { data: items.filter(Boolean), counts: { pendingAssets: assetIds.length && st === 'PENDING_REVIEW' ? assets.length : 0, pendingEmails: draftIds.length && st === 'PENDING_REVIEW' ? drafts.length : 0 } };
  }

  /** Approved emails that still need the separate, deliberate Send confirmation. */
  @Get('ready-to-send')
  @Doc('Approved drafts awaiting the explicit Send confirmation')
  async ready(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.communicationDraft.findMany({ where: { tenantId: u.tenantId, status: { in: ['APPROVED', 'SEND_FAILED'] } }, orderBy: { updatedAt: 'desc' }, take: 30 });
    return { data: await Promise.all(rows.map((r) => this.comms.get(u, r.id))) };
  }
}

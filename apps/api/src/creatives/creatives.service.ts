import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { buildCreativeBrief, getImageProvider } from '@techmunda/core';
import type { AspectRatio } from '@techmunda/shared';
import { AuditService } from '../audit/audit.service';
import { found } from '../common/helpers';
import { QueueService } from '../common/queue.service';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { MediaUrlService } from '../media/media-url.service';

@Injectable()
export class CreativesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv, private readonly queues: QueueService, private readonly urls: MediaUrlService, private readonly audit: AuditService) {}

  async createJob(user: AuthUser, input: { productId: string; sourceMediaId: string; style: string; aspectRatio: AspectRatio; variations: number; promptNotes?: string }, provider = getImageProvider) {
    const product = found(await this.prisma.product.findFirst({ where: { id: input.productId, tenantId: user.tenantId } }), 'Product');
    const source = found(await this.prisma.productMedia.findFirst({ where: { id: input.sourceMediaId, tenantId: user.tenantId, productId: product.id, isOriginal: true } }), 'Source image');
    if (!source.rightsConfirmed || source.reviewStatus !== 'APPROVED') throw new BadRequestException({ code: 'SOURCE_NOT_AUTHORISED', message: 'Only client-authorised original images can be used' });

    // Throws a ProviderError(NOT_CONFIGURED) when AI_MODE=openai without a key → 503, no job is created.
    const img = provider(this.env);
    const brief = buildCreativeBrief(product, input.style, input.aspectRatio, input.promptNotes);
    const job = await this.prisma.creativeJob.create({
      data: {
        tenantId: user.tenantId, productId: product.id, sourceMediaId: source.id, prompt: brief.prompt, brief: brief as object, style: input.style,
        aspectRatio: input.aspectRatio, variations: input.variations, provider: img.name, simulated: img.simulated, status: 'QUEUED', requestedBy: user.id,
      },
    });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'creative_job', entityId: job.id, action: 'creative.requested', metadata: { style: input.style, provider: img.name, simulated: img.simulated } });
    await this.queues.enqueueCreative({ tenantId: user.tenantId, creativeJobId: job.id });
    return this.getJob(user, job.id);
  }

  async listJobs(user: AuthUser, productId?: string) {
    const jobs = await this.prisma.creativeJob.findMany({ where: { tenantId: user.tenantId, ...(productId ? { productId } : {}) }, orderBy: { createdAt: 'desc' }, take: 30, include: { product: { select: { name: true, sku: true } }, _count: { select: { assets: true } } } });
    return { data: jobs.map((j) => ({ id: j.id, productId: j.productId, productName: j.product.name, style: j.style, aspectRatio: j.aspectRatio, status: j.status, provider: j.provider, simulated: j.simulated, errorMessage: j.errorMessage, assetCount: j._count.assets, createdAt: j.createdAt, completedAt: j.completedAt })) };
  }

  async getJob(user: AuthUser, id: string) {
    const j = found(await this.prisma.creativeJob.findFirst({ where: { id, tenantId: user.tenantId }, include: { assets: { orderBy: { createdAt: 'asc' } }, source: true, product: { select: { name: true, sku: true } } } }), 'Creative job');
    return {
      id: j.id, productId: j.productId, productName: j.product.name, style: j.style, aspectRatio: j.aspectRatio, prompt: j.prompt, brief: j.brief, status: j.status,
      provider: j.provider, simulated: j.simulated, errorMessage: j.errorMessage, createdAt: j.createdAt, completedAt: j.completedAt,
      source: { id: j.source.id, url: await this.urls.viewUrl(user.tenantId, j.source.storageKey, j.source.mimeType) },
      assets: await Promise.all(j.assets.map((a) => this.assetView(user.tenantId, a))),
    };
  }

  async assetView(tenantId: string, a: any) {
    return { id: a.id, creativeJobId: a.creativeJobId, aspectRatio: a.aspectRatio, simulated: a.simulated, accuracyFlags: a.accuracyFlags, reviewStatus: a.reviewStatus, reviewNotes: a.reviewNotes, reviewedAt: a.reviewedAt, createdAt: a.createdAt, url: await this.urls.viewUrl(tenantId, a.storageKey, 'image/png') };
  }

  async listAssets(user: AuthUser, status?: string, productId?: string) {
    const rows = await this.prisma.generatedAsset.findMany({
      where: { tenantId: user.tenantId, ...(status ? { reviewStatus: status as any } : {}), ...(productId ? { job: { productId } } : {}) },
      orderBy: { createdAt: 'desc' }, take: 60, include: { job: { include: { product: { select: { name: true, sku: true } }, source: true } } },
    });
    return {
      data: await Promise.all(rows.map(async (a) => ({
        ...(await this.assetView(user.tenantId, a)), productName: a.job.product.name, style: a.job.style, prompt: a.job.prompt, provider: a.job.provider,
        sourceUrl: await this.urls.viewUrl(user.tenantId, a.job.source.storageKey, a.job.source.mimeType),
      }))),
    };
  }

  private async asset(user: AuthUser, id: string) {
    return found(await this.prisma.generatedAsset.findFirst({ where: { id, tenantId: user.tenantId } }), 'Asset');
  }

  async submitReview(user: AuthUser, id: string) {
    const a = await this.asset(user, id);
    if (!['DRAFT', 'REJECTED'].includes(a.reviewStatus)) throw new ConflictException({ code: 'INVALID_STATE', message: `Asset is already ${a.reviewStatus}` });
    await this.prisma.$transaction(async (tx) => {
      await tx.generatedAsset.update({ where: { id }, data: { reviewStatus: 'PENDING_REVIEW', reviewNotes: null, reviewedBy: null, reviewedAt: null } });
      await tx.approvalRequest.create({ data: { tenantId: user.tenantId, resourceType: 'GENERATED_ASSET', resourceId: id, requestedBy: user.id } });
    });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'generated_asset', entityId: id, action: 'creative.submitted_for_review' });
    return { id, reviewStatus: 'PENDING_REVIEW' };
  }

  async decide(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', notes?: string) {
    const a = await this.asset(user, id);
    if (a.reviewStatus !== 'PENDING_REVIEW') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only assets pending review can be approved or rejected' });
    const now = new Date();
    // conditional update guards against double-approve races
    const res = await this.prisma.generatedAsset.updateMany({ where: { id, tenantId: user.tenantId, reviewStatus: 'PENDING_REVIEW' }, data: { reviewStatus: decision, reviewNotes: notes ?? null, reviewedBy: user.id, reviewedAt: now } });
    if (res.count !== 1) throw new ConflictException({ code: 'INVALID_STATE', message: 'Asset was already reviewed' });
    await this.prisma.approvalRequest.updateMany({ where: { tenantId: user.tenantId, resourceType: 'GENERATED_ASSET', resourceId: id, status: 'PENDING_REVIEW' }, data: { status: decision, reviewedBy: user.id, reviewedAt: now, reviewNotes: notes ?? null } });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: decision === 'APPROVED' ? 'creative.approved' : 'creative.rejected', resourceType: 'generated_asset', resourceId: id });
    await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'generated_asset', entityId: id, action: decision === 'APPROVED' ? 'creative.approved' : 'creative.rejected' });
    return { id, reviewStatus: decision };
  }

  /** Export is only possible for APPROVED assets. */
  async exportAsset(user: AuthUser, id: string) {
    const a = await this.asset(user, id);
    if (a.reviewStatus !== 'APPROVED') throw new ConflictException({ code: 'NOT_APPROVED', message: 'Only approved assets can be exported' });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'creative.exported', resourceType: 'generated_asset', resourceId: id });
    return { url: await this.urls.viewUrl(user.tenantId, a.storageKey, 'image/png', { download: true, ttl: 300 }), simulated: a.simulated };
  }
}

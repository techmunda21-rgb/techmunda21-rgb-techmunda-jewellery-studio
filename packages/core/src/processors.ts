import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import type { AspectRatio } from '@techmunda/shared';
import { recordActivity } from './activity';
import { qualifyEnquiry } from './ai/qualification';
import { getImageProvider } from './ai/image';
import { ProviderError } from './ai/types';
import type { Env } from './env';
import { scrubSecrets } from './redact';
import type { StorageDriver } from './storage';

export interface ProcessorDeps {
  prisma: PrismaClient;
  env: Env;
  storage: StorageDriver;
}

/** Lead qualification. Idempotent: safe to re-run for the same lead. */
export async function processQualification({ prisma, env }: ProcessorDeps, data: { tenantId: string; leadId: string }) {
  const lead = await prisma.lead.findFirst({ where: { id: data.leadId, tenantId: data.tenantId }, include: { contact: true } });
  if (!lead) throw new Error('Lead not found for tenant');

  const result = await qualifyEnquiry(env, {
    message: lead.message,
    productInterest: lead.productInterest,
    budgetRange: lead.budgetMin != null || lead.budgetMax != null ? [lead.budgetMin, lead.budgetMax].filter((x) => x != null).join('-') : null,
    preferredMaterial: lead.preferredMaterial,
    purchaseTimeline: lead.purchaseTimeline,
    appointmentRequested: !!lead.appointmentDate,
  });
  const o = result.output;

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      leadScore: o.qualification_score,
      qualificationReason: o.qualification_reason,
      qualificationSource: result.source,
      qualificationData: { ...o, scoreBreakdown: result.breakdown, scoreIsHeuristic: true } as object,
      requiresHumanReview: o.requires_human_review,
      productInterest: lead.productInterest ?? o.product_category,
      budgetMin: lead.budgetMin ?? o.budget_min,
      budgetMax: lead.budgetMax ?? o.budget_max,
      purchaseTimeline: lead.purchaseTimeline ?? o.purchase_timeline,
      // Only a NEW lead is auto-advanced; humans own every later stage change.
      status: lead.status === 'NEW' && o.qualification_score >= 40 && o.intent !== 'support' ? 'QUALIFIED' : lead.status,
    },
  });
  if (updated.status === 'QUALIFIED' && lead.status === 'NEW') {
    await prisma.opportunity.updateMany({ where: { tenantId: data.tenantId, leadId: lead.id, stage: 'NEW' }, data: { stage: 'QUALIFIED' } });
  }

  await recordActivity(prisma, {
    tenantId: data.tenantId,
    entityType: 'lead',
    entityId: lead.id,
    leadId: lead.id,
    action: 'lead.qualified',
    metadata: { score: o.qualification_score, intent: o.intent, source: result.source, requiresHumanReview: o.requires_human_review },
  });
  return updated;
}

/** Runs a creative job end to end. Failures are recorded on the job (never swallowed). */
export async function processCreativeJob({ prisma, env, storage }: ProcessorDeps, data: { tenantId: string; creativeJobId: string }) {
  const job = await prisma.creativeJob.findFirst({ where: { id: data.creativeJobId, tenantId: data.tenantId }, include: { source: true, product: true } });
  if (!job) throw new Error('Creative job not found for tenant');
  if (job.status === 'COMPLETED') return job;

  await prisma.creativeJob.update({ where: { id: job.id }, data: { status: 'RUNNING', errorMessage: null } });
  try {
    const provider = getImageProvider(env);
    // Normalise: apply EXIF rotation, strip metadata (GPS etc.), cap size, re-encode as PNG before it leaves our systems.
    const source = await sharp(await storage.get(job.source.storageKey)).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const images = await provider.edit({
      source,
      sourceMime: 'image/png',
      prompt: job.prompt,
      style: job.style,
      aspectRatio: job.aspectRatio as AspectRatio,
      variations: job.variations,
    });

    // Re-runs replace earlier unreviewed output instead of duplicating it.
    await prisma.generatedAsset.deleteMany({ where: { creativeJobId: job.id, reviewStatus: { in: ['PENDING_REVIEW', 'DRAFT'] } } });
    const flags = provider.simulated
      ? ['SIMULATED: backdrop composited around the original photo; no AI rendering was performed', 'Verify the product matches the catalogue record before any use']
      : ['AI-edited image: verify hallmark, gemstone count and colours, metal finish and proportions against the original before approval'];

    for (const img of images) {
      const key = `${data.tenantId}/generated/${randomUUID()}.png`;
      await storage.put(key, img.data, img.mimeType);
      const asset = await prisma.generatedAsset.create({
        data: { tenantId: data.tenantId, creativeJobId: job.id, storageKey: key, aspectRatio: job.aspectRatio, simulated: img.simulated, accuracyFlags: flags, reviewStatus: 'DRAFT' },
      });
      void asset; // a human submits it for review explicitly (POST /creatives/assets/:id/submit-review)
    }
    const done = await prisma.creativeJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date(), provider: provider.name, simulated: provider.simulated } });
    await recordActivity(prisma, { tenantId: data.tenantId, actorId: job.requestedBy, entityType: 'creative_job', entityId: job.id, action: 'creative.generated', metadata: { provider: provider.name, simulated: provider.simulated, count: images.length } });
    await notifyDesigners(prisma, data.tenantId, job.id, images.length);
    return done;
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    const message = scrubSecrets(err instanceof Error ? err.message : 'Unknown error');
    const retryable = pe?.retryable ?? false;
    await prisma.creativeJob.update({ where: { id: job.id }, data: { status: retryable ? 'QUEUED' : 'FAILED', errorMessage: message, completedAt: retryable ? null : new Date() } });
    await recordActivity(prisma, { tenantId: data.tenantId, actorId: job.requestedBy, entityType: 'creative_job', entityId: job.id, action: 'creative.failed', metadata: { code: pe?.code ?? 'UNKNOWN', retryable } });
    if (retryable) throw err; // let BullMQ back off and retry
    return null;
  }
}

async function notifyDesigners(prisma: PrismaClient, tenantId: string, jobId: string, count: number) {
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', role: { in: ['DESIGNER', 'MANAGER', 'TENANT_OWNER'] } }, select: { id: true } });
  if (!users.length) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({ tenantId, userId: u.id, type: 'creative.ready', title: `${count} generated asset${count === 1 ? '' : 's'} awaiting review`, link: '/creative-studio' })),
  });
}

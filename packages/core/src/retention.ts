import type { PrismaClient } from '@prisma/client';
import type { StorageDriver } from './storage';

/**
 * Enforces the published retention promise: self-service demo workspaces are deleted (rows + stored files)
 * after `demo_expires_at`; stale signup requests (which hold a password hash) are removed after 7 days.
 */
export async function purgeExpiredDemos(prisma: PrismaClient, storage: StorageDriver, now = new Date()) {
  const expired = await prisma.tenant.findMany({ where: { isDemo: true, demoExpiresAt: { lt: now } }, select: { id: true } });
  for (const t of expired) await deleteTenantCompletely(prisma, storage, t.id);
  const stale = await prisma.signupRequest.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
  return { tenantsDeleted: expired.length, signupRequestsDeleted: stale.count };
}

export async function deleteTenantCompletely(prisma: PrismaClient, storage: StorageDriver, tenantId: string) {
  const [media, assets, docs] = await Promise.all([
    prisma.productMedia.findMany({ where: { tenantId }, select: { storageKey: true } }),
    prisma.generatedAsset.findMany({ where: { tenantId }, select: { storageKey: true } }),
    prisma.showcaseDocument.findMany({ where: { tenantId }, select: { storageKey: true } }),
  ]);
  await prisma.tenant.delete({ where: { id: tenantId } }); // FK cascades remove every tenant-owned row
  await Promise.allSettled([...media, ...assets, ...docs].map((o) => storage.remove(o.storageKey)));
}

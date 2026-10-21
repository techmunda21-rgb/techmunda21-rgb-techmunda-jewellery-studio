import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ActivityInput {
  tenantId: string;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  leadId?: string | null;
  action: string;
  metadata?: Prisma.InputJsonValue;
}

/** CRM / timeline activity. Metadata must never contain tokens or message bodies. */
export function recordActivity(db: Db, a: ActivityInput) {
  return db.activityLog.create({
    data: { tenantId: a.tenantId, actorId: a.actorId ?? null, entityType: a.entityType, entityId: a.entityId, leadId: a.leadId ?? null, action: a.action, metadata: a.metadata },
  });
}

export interface AuditInput {
  tenantId: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export function recordAudit(db: Db, a: AuditInput) {
  return db.auditLog.create({
    data: { tenantId: a.tenantId, actorId: a.actorId ?? null, action: a.action, resourceType: a.resourceType, resourceId: a.resourceId ?? null, ipAddress: a.ipAddress ?? null, metadata: a.metadata },
  });
}

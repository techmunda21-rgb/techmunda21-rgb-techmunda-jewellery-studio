import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { opportunityInputSchema, opportunityUpdateSchema, paginationSchema } from '@techmunda/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { found, num, pageArgs, paged } from '../common/helpers';
import { PRISMA, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';

const SALES = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'] as const;
const actQuery = paginationSchema.extend({ leadId: z.string().uuid().optional() });

@ApiTags('CRM')
@Controller()
export class OpportunitiesController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, private readonly audit: AuditService) {}

  private shape(o: any) {
    return { id: o.id, leadId: o.leadId, name: o.name, estimatedValue: num(o.estimatedValue), currency: o.currency, stage: o.stage, expectedCloseDate: o.expectedCloseDate, createdAt: o.createdAt, contactName: o.lead?.contact?.name };
  }

  @Get('opportunities')
  @Doc('List opportunities')
  async list(@CurrentUser() u: AuthUser, @Query(zod(paginationSchema)) q: { page: number; pageSize: number }) {
    const where = { tenantId: u.tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.opportunity.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q.page, q.pageSize), include: { lead: { select: { contact: { select: { name: true } } } } } }),
      this.prisma.opportunity.count({ where }),
    ]);
    return paged(rows.map((r) => this.shape(r)), total, q.page, q.pageSize);
  }

  @Post('opportunities')
  @Roles(...SALES)
  @Doc('Create an opportunity for a lead', opportunityInputSchema)
  async create(@CurrentUser() u: AuthUser, @Body(zod(opportunityInputSchema)) b: any) {
    const lead = found(await this.prisma.lead.findFirst({ where: { id: b.leadId, tenantId: u.tenantId } }), 'Lead');
    const o = await this.prisma.opportunity.create({ data: { ...b, tenantId: u.tenantId, stage: lead.status } });
    await this.audit.activity({ tenantId: u.tenantId, actorId: u.id, entityType: 'opportunity', entityId: o.id, leadId: lead.id, action: 'opportunity.created', metadata: { value: b.estimatedValue ?? null } });
    return this.shape(o);
  }

  @Patch('opportunities/:id')
  @Roles(...SALES)
  @Doc('Update opportunity value, stage or close date', opportunityUpdateSchema)
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(opportunityUpdateSchema)) b: any) {
    const o = found(await this.prisma.opportunity.findFirst({ where: { id, tenantId: u.tenantId } }), 'Opportunity');
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.opportunity.update({ where: { id }, data: b });
      if (b.stage && b.stage !== o.stage) {
        await tx.lead.update({ where: { id: o.leadId }, data: { status: b.stage } });
        await this.audit.activity({ tenantId: u.tenantId, actorId: u.id, entityType: 'lead', entityId: o.leadId, leadId: o.leadId, action: 'lead.stage_changed', metadata: { from: o.stage, to: b.stage } }, tx);
      }
      if (b.estimatedValue !== undefined) await this.audit.activity({ tenantId: u.tenantId, actorId: u.id, entityType: 'opportunity', entityId: id, leadId: o.leadId, action: 'opportunity.value_changed', metadata: { value: b.estimatedValue } }, tx);
      return r;
    });
    return this.shape(updated);
  }

  @Get('activities')
  @Doc('CRM activity feed / timeline')
  async activities(@CurrentUser() u: AuthUser, @Query(zod(actQuery)) q: z.infer<typeof actQuery>) {
    const where: any = { tenantId: u.tenantId, ...(q.leadId ? { leadId: q.leadId } : {}) };
    const [rows, total] = await Promise.all([this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q.page, q.pageSize) }), this.prisma.activityLog.count({ where })]);
    return paged(rows, total, q.page, q.pageSize);
  }
}

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { processCreativeJob, scrubSecrets } from '@techmunda/core';
import type { PublicLeadInput } from '@techmunda/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import { CommunicationsService } from '../communications/communications.service';
import { found } from '../common/helpers';
import { ENV, PRISMA, STORAGE, type AppEnv, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class AutomationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaDb,
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(STORAGE) private readonly storage: AppStorage,
    private readonly leads: LeadsService,
    private readonly comms: CommunicationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Idempotent, tenant-scoped execution with a recorded run. A repeated correlationId never re-executes a succeeded run. */
  async runOnce<T>(tenantId: string, workflow: string, correlationId: string, fn: () => Promise<T>): Promise<{ duplicate: boolean; result?: T }> {
    const key = { tenantId_workflowName_correlationId: { tenantId, workflowName: workflow, correlationId } };
    const existing = await this.prisma.automationRun.findUnique({ where: key });
    if (existing?.status === 'SUCCEEDED') return { duplicate: true };
    if (existing?.status === 'RUNNING' && Date.now() - existing.startedAt.getTime() < 5 * 60_000) throw new ConflictException({ code: 'RUN_IN_PROGRESS', message: 'This correlation id is already running' });
    const run = existing
      ? await this.prisma.automationRun.update({ where: { id: existing.id }, data: { status: 'RUNNING', attemptCount: { increment: 1 }, errorMessage: null, startedAt: new Date() } })
      : await this.prisma.automationRun.create({ data: { tenantId, workflowName: workflow, correlationId } });
    try {
      const result = await fn();
      await this.prisma.automationRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
      return { duplicate: false, result };
    } catch (e) {
      await this.prisma.automationRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), errorMessage: scrubSecrets((e as Error).message).slice(0, 500) } });
      throw e;
    }
  }

  leadCapture(tenantId: string, correlationId: string, payload: PublicLeadInput) {
    return this.runOnce(tenantId, 'lead-capture', correlationId, () => this.leads.capture(tenantId, payload, null, 'n8n_lead_capture'));
  }

  creativeJob(tenantId: string, correlationId: string, creativeJobId: string) {
    return this.runOnce(tenantId, 'creative-job', correlationId, async () => {
      found(await this.prisma.creativeJob.findFirst({ where: { id: creativeJobId, tenantId }, select: { id: true } }), 'Creative job');
      await processCreativeJob({ prisma: this.prisma, env: this.env, storage: this.storage }, { tenantId, creativeJobId });
      return { creativeJobId };
    });
  }

  /** Creates PENDING_REVIEW drafts only for consented contacts. Never sends. */
  followUpDue(tenantId: string, correlationId: string, limit = 10) {
    return this.runOnce(tenantId, 'followup-draft', correlationId, async () => {
      const due = await this.prisma.lead.findMany({
        where: { tenantId, status: { in: ['NEW', 'QUALIFIED', 'CONTACTED'] }, nextFollowUpAt: { lte: new Date() }, contact: { consentStatus: 'GRANTED', email: { not: null } }, drafts: { none: { status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENDING'] } } } },
        include: { contact: true }, take: Math.min(limit, 25), orderBy: { nextFollowUpAt: 'asc' },
      });
      const skippedNoConsent = await this.prisma.lead.count({ where: { tenantId, status: { in: ['NEW', 'QUALIFIED', 'CONTACTED'] }, nextFollowUpAt: { lte: new Date() }, contact: { NOT: { consentStatus: 'GRANTED' } } } });
      const created: string[] = [];
      for (const lead of due) {
        const actorRow = (lead.assignedTo && (await this.prisma.user.findFirst({ where: { id: lead.assignedTo, tenantId, status: 'ACTIVE' } }))) || (await this.prisma.user.findFirstOrThrow({ where: { tenantId, status: 'ACTIVE', role: { in: ['TENANT_OWNER', 'MANAGER'] } } }));
        const actor: AuthUser = { id: actorRow.id, tenantId, role: actorRow.role as AuthUser['role'], email: actorRow.email, fullName: actorRow.fullName };
        const d = await this.comms.create(actor, { leadId: lead.id, generate: true });
        created.push(d.id);
        await this.prisma.notification.create({ data: { tenantId, userId: actor.id, type: 'draft.pending_review', title: `Follow-up draft for ${lead.contact.name} awaits your review`, link: '/approvals' } });
      }
      return { draftsCreated: created.length, skippedNoConsent };
    });
  }

  sendApproved(tenantId: string, correlationId: string, confirmationToken: string) {
    return this.runOnce(tenantId, 'approved-send', correlationId, async () => {
      const sent = await this.comms.sendWithConfirmation(tenantId, confirmationToken);
      return { draftId: sent.id, status: sent.status, providerMessageId: sent.providerMessageId };
    });
  }

  dailyReport(tenantId: string, correlationId: string) {
    return this.runOnce(tenantId, 'daily-report', correlationId, async () => {
      const o = await this.analytics.overview(tenantId, 1);
      const k = o.kpis;
      const text = `Daily summary: ${k.newLeads.value} new leads awaiting qualification, ${k.pendingFollowUps.value} follow-ups due, ${k.appointments.value} appointments, pipeline ₹${Math.round(k.pipelineValue.value).toLocaleString('en-IN')}, won ₹${Math.round(k.wonRevenue.value).toLocaleString('en-IN')}.`;
      const owners = await this.prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', role: { in: ['TENANT_OWNER', 'MANAGER'] } }, select: { id: true } });
      await this.prisma.notification.createMany({ data: owners.map((u) => ({ tenantId, userId: u.id, type: 'report.daily', title: 'Daily sales report', body: text, link: '/overview' })) });
      return { summary: text, kpis: k };
    });
  }
}

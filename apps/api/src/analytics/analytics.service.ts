import { Inject, Injectable } from '@nestjs/common';
import { LEAD_STAGES } from '@techmunda/shared';
import { num } from '../common/helpers';
import { PRISMA, type PrismaDb } from '../common/tokens';

const OPEN = ['NEW', 'QUALIFIED', 'CONTACTED', 'APPOINTMENT', 'PROPOSAL', 'NEGOTIATION'] as const;
const pct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100));
const day = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb) {}

  async overview(tenantId: string, days = 30) {
    const now = new Date();
    const from = new Date(now.getTime() - days * day);
    const prevFrom = new Date(from.getTime() - days * day);
    const [total, totalPrev, qualified, qualifiedPrev, appts, apptsPrev, pipelineAgg, pipelinePrev, wonAgg, proposals, followUps, newLeads, tasksDue, stageCounts] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: from } } }),
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: prevFrom, lt: from } } }),
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: from }, status: { notIn: ['NEW'] }, leadScore: { gte: 40 } } }),
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: prevFrom, lt: from }, status: { notIn: ['NEW'] }, leadScore: { gte: 40 } } }),
      this.prisma.lead.count({ where: { tenantId, OR: [{ status: 'APPOINTMENT' }, { appointmentDate: { gte: now } }] } }),
      this.prisma.lead.count({ where: { tenantId, status: 'APPOINTMENT', updatedAt: { lt: from } } }),
      this.prisma.opportunity.aggregate({ where: { tenantId, stage: { in: [...OPEN] } }, _sum: { estimatedValue: true }, _count: true }),
      this.prisma.opportunity.aggregate({ where: { tenantId, stage: { in: [...OPEN] }, createdAt: { lt: from } }, _sum: { estimatedValue: true } }),
      this.prisma.opportunity.aggregate({ where: { tenantId, stage: 'WON' }, _sum: { estimatedValue: true }, _count: true }),
      this.prisma.opportunity.aggregate({ where: { tenantId, stage: 'PROPOSAL' }, _sum: { estimatedValue: true }, _count: true }),
      this.prisma.lead.count({ where: { tenantId, status: { in: [...OPEN] }, nextFollowUpAt: { lte: now } } }),
      this.prisma.lead.count({ where: { tenantId, status: 'NEW' } }),
      this.prisma.task.count({ where: { tenantId, completedAt: null, dueAt: { lte: now } } }),
      this.prisma.lead.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    ]);

    // monthly won revenue (last 6 months) — bucketed in JS to stay DB-agnostic
    const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const won = await this.prisma.opportunity.findMany({ where: { tenantId, stage: 'WON', updatedAt: { gte: since } }, select: { estimatedValue: true, updatedAt: true } });
    const revenue = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const v = won.filter((w) => w.updatedAt.getFullYear() === d.getFullYear() && w.updatedAt.getMonth() === d.getMonth()).reduce((s, w) => s + (num(w.estimatedValue) ?? 0), 0);
      return { month: d.toLocaleString('en', { month: 'short' }), revenue: v };
    });
    const funnel = LEAD_STAGES.map((s) => ({ stage: s, count: stageCounts.find((c) => c.status === s)?._count ?? 0 }));

    return {
      periodDays: days,
      kpis: {
        totalLeads: { value: total, deltaPct: pct(total, totalPrev) },
        qualifiedLeads: { value: qualified, deltaPct: pct(qualified, qualifiedPrev) },
        appointments: { value: appts, deltaPct: pct(appts, apptsPrev) },
        pipelineValue: { value: num(pipelineAgg._sum.estimatedValue) ?? 0, count: pipelineAgg._count, deltaPct: pct(num(pipelineAgg._sum.estimatedValue) ?? 0, num(pipelinePrev._sum.estimatedValue) ?? 0) },
        wonRevenue: { value: num(wonAgg._sum.estimatedValue) ?? 0, count: wonAgg._count },
        outstandingProposals: { value: num(proposals._sum.estimatedValue) ?? 0, count: proposals._count },
        pendingFollowUps: { value: followUps + tasksDue },
        newLeads: { value: newLeads },
      },
      revenue,
      funnel,
    };
  }

  async leads(tenantId: string) {
    const [bySource, scores, last14, byStage] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['source'], where: { tenantId }, _count: true }),
      this.prisma.lead.findMany({ where: { tenantId, leadScore: { not: null } }, select: { leadScore: true } }),
      this.prisma.lead.findMany({ where: { tenantId, createdAt: { gte: new Date(Date.now() - 14 * day) } }, select: { createdAt: true } }),
      this.prisma.lead.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    ]);
    const bucket = (lo: number, hi: number) => scores.filter((s) => s.leadScore! >= lo && s.leadScore! <= hi).length;
    const daily = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * day);
      return { date: d.toISOString().slice(0, 10), count: last14.filter((l) => l.createdAt.toISOString().slice(0, 10) === d.toISOString().slice(0, 10)).length };
    });
    const total = byStage.reduce((s, x) => s + x._count, 0);
    const won = byStage.find((s) => s.status === 'WON')?._count ?? 0;
    return {
      bySource: bySource.map((s) => ({ source: s.source, count: s._count })),
      scoreDistribution: [{ band: '0-39', count: bucket(0, 39) }, { band: '40-69', count: bucket(40, 69) }, { band: '70-100', count: bucket(70, 100) }],
      daily,
      conversion: { total, won, winRatePct: total ? Math.round((won / total) * 100) : 0 },
      note: 'Lead score is a prioritisation heuristic, not a purchase probability.',
    };
  }

  async campaigns(tenantId: string) {
    const [campaigns, assets, drafts] = await Promise.all([
      this.prisma.campaign.findMany({ where: { tenantId }, include: { _count: { select: { assets: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.generatedAsset.groupBy({ by: ['reviewStatus'], where: { tenantId }, _count: true }),
      this.prisma.communicationDraft.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    ]);
    return {
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, type: c.campaignType, status: c.status, assetCount: c._count.assets, budget: num(c.budget), currency: c.currency })),
      contentProduction: assets.map((a) => ({ status: a.reviewStatus, count: a._count })),
      communications: drafts.map((d) => ({ status: d.status, count: d._count })),
      // Honest scope note: no ad-platform integration exists, so reach/CTR/spend are NOT reported.
      performanceMetricsAvailable: false,
      note: 'Content production and follow-up activity are tracked here. Ad performance (reach, clicks, spend) requires an ad-platform integration that is not part of this demo.',
    };
  }
}

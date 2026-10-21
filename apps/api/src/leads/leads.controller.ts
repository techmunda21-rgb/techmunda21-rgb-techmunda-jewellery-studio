import { Body, Controller, Get, HttpCode, Inject, Logger, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  csvImportCommitSchema, csvImportPreviewSchema, leadUpdateSchema, noteSchema, paginationSchema, publicLeadSchema, suggestReplySchema, taskSchema, taskUpdateSchema, CONSENT_TEXT,
  type PublicLeadInput,
} from '@techmunda/shared';
import { z } from 'zod';
import { ClientIp, CurrentUser, Doc, Public, Roles } from '../common/decorators';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { LeadsService } from './leads.service';

const listQuery = paginationSchema.extend({ status: z.string().max(20).optional(), assignedTo: z.string().max(40).optional(), minScore: z.coerce.number().int().min(0).max(100).optional() });
const SALES = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'] as const;

@ApiTags('Public')
@Controller('public')
export class PublicLeadsController {
  private readonly logger = new Logger('PublicLeads');
  constructor(private readonly leads: LeadsService, @Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv) {}

  /** Public enquiry endpoint: rate-limited, honeypot + timing trap, optional Turnstile, no data echoed back. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('leads')
  @HttpCode(201)
  @Doc('Submit a customer enquiry (public)', publicLeadSchema)
  async submit(@Body(zod(publicLeadSchema)) body: PublicLeadInput, @ClientIp() ip: string) {
    // Bots fill hidden fields or submit instantly: pretend success, store nothing.
    if (body.website || (body.formStartedAt && Date.now() - body.formStartedAt < 1500)) return { ok: true };
    if (this.env.TURNSTILE_SECRET) {
      const ok = await this.verifyTurnstile(body.turnstileToken, ip);
      if (!ok) throw new NotFoundException({ code: 'BOT_CHECK_FAILED', message: 'Bot check failed. Please retry.' });
    }
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: body.tenantSlug, status: 'ACTIVE' }, select: { id: true } });
    if (!tenant) throw new NotFoundException({ code: 'NOT_FOUND', message: 'This enquiry page is not available' });
    await this.leads.capture(tenant.id, body, ip);
    return { ok: true };
  }

  @Public()
  @Get('tenants/:slug')
  @Doc('Public business name for the enquiry page (no private data)')
  async tenantInfo(@Param('slug') slug: string) {
    const t = await this.prisma.tenant.findFirst({ where: { slug, status: 'ACTIVE' }, select: { name: true, slug: true, country: true, currency: true } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    return { ...t, consentText: CONSENT_TEXT, botCheck: this.env.TURNSTILE_SECRET ? 'turnstile' : 'honeypot' };
  }

  private async verifyTurnstile(token: string | undefined, ip: string) {
    if (!token) return false;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: this.env.TURNSTILE_SECRET!, response: token, remoteip: ip }) });
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch (e) {
      this.logger.warn(`Turnstile verification error: ${(e as Error).message}`);
      return false; // fail closed
    }
  }
}

@ApiTags('Leads')
@Controller()
export class LeadsController {
  constructor(private readonly svc: LeadsService) {}

  @Get('leads')
  @Doc('List leads with search and filters')
  list(@CurrentUser() u: AuthUser, @Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(u, q);
  }

  @Get('leads/board')
  @Doc('Kanban board: leads grouped by pipeline stage')
  board(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    return this.svc.board(u, q?.slice(0, 100));
  }

  @Post('leads/import/preview')
  @Roles(...SALES)
  @Doc('Preview a CSV import with duplicate detection (nothing is inserted)', csvImportPreviewSchema)
  preview(@CurrentUser() u: AuthUser, @Body(zod(csvImportPreviewSchema)) b: { csv: string }) {
    return this.svc.importPreview(u, b.csv);
  }

  @Post('leads/import/commit')
  @Roles(...SALES)
  @Doc('Insert reviewed CSV rows (no marketing consent is assumed)', csvImportCommitSchema)
  commit(@CurrentUser() u: AuthUser, @Body(zod(csvImportCommitSchema)) b: any) {
    return this.svc.importCommit(u, b.rows);
  }

  @Get('leads/:id')
  @Doc('Lead detail with timeline, notes, tasks and drafts')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @Patch('leads/:id')
  @Roles(...SALES)
  @Doc('Update stage, assignment or follow-up', leadUpdateSchema)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(leadUpdateSchema)) b: any) {
    return this.svc.update(u, id, b);
  }

  @Post('leads/:id/qualify')
  @HttpCode(202)
  @Roles(...SALES)
  @Doc('Queue AI qualification for a lead')
  qualify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.requalify(u, id);
  }

  @Post('leads/:id/notes')
  @Roles(...SALES)
  @Doc('Add a note', noteSchema)
  note(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(noteSchema)) b: { body: string }) {
    return this.svc.addNote(u, id, b.body);
  }

  @Post('leads/:id/tasks')
  @Roles(...SALES)
  @Doc('Add a task / follow-up reminder', taskSchema)
  task(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(taskSchema)) b: any) {
    return this.svc.addTask(u, id, b);
  }

  @Post('leads/:id/suggest-reply')
  @Roles(...SALES)
  @Doc('AI-generated internal reply suggestions (never sent)', suggestReplySchema)
  suggest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(suggestReplySchema)) b: { tone: 'warm' | 'concise' | 'formal' }) {
    return this.svc.suggest(u, id, b.tone);
  }

  @Get('tasks')
  @Doc('Open tasks and follow-up reminders')
  tasks(@CurrentUser() u: AuthUser) {
    return this.svc.pendingTasks(u);
  }

  @Patch('tasks/:id')
  @Roles(...SALES)
  @Doc('Complete or reschedule a task', taskUpdateSchema)
  updateTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(taskUpdateSchema)) b: any) {
    return this.svc.updateTask(u, id, b);
  }

  @Post('contacts/:id/consent/withdraw')
  @Roles(...SALES)
  @Doc('Record that a contact withdrew consent (blocks all outreach)')
  withdraw(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.withdrawConsent(u, id);
  }
}

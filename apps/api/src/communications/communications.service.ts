import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { renderEmailHtml } from '@techmunda/shared';
import { signPayload, verifyPayload, scrubSecrets } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { found, pageArgs, paged } from '../common/helpers';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { GMAIL_GATEWAY, GmailError, buildRawMessage, type GmailGateway } from '../integrations/gmail.gateway';
import { IntegrationsService } from '../integrations/integrations.service';
import { LeadsService } from '../leads/leads.service';

export const OPT_OUT_FOOTER = '\n\n—\nIf you would prefer not to hear from us, simply reply "STOP" and we will not contact you again.';
const DAILY_SEND_LIMIT = 200;
const RETRY_DELAYS_MS = [400, 1500];

type Draft = NonNullable<Awaited<ReturnType<CommunicationsService['rawDraft']>>>;

@Injectable()
export class CommunicationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaDb,
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(GMAIL_GATEWAY) private readonly gmail: GmailGateway,
    private readonly integrations: IntegrationsService,
    private readonly leads: LeadsService,
    private readonly audit: AuditService,
  ) {}

  private async businessName(tenantId: string) {
    return (await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } })).name;
  }

  rawDraft(tenantId: string, id: string) {
    return this.prisma.communicationDraft.findFirst({ where: { id, tenantId }, include: { lead: { include: { contact: true } } } });
  }

  private view(d: any) {
    return {
      id: d.id, leadId: d.leadId, channel: d.channel, recipient: d.recipient, subject: d.subject, body: d.body, status: d.status, version: d.version,
      approvedVersion: d.approvedVersion, aiGenerated: d.aiGenerated, aiSource: d.aiSource, providerDraftId: d.providerDraftId, providerMessageId: d.providerMessageId,
      lastError: d.lastError, createdBy: d.createdBy, approvedBy: d.approvedBy, approvedAt: d.approvedAt, sentAt: d.sentAt, createdAt: d.createdAt, updatedAt: d.updatedAt,
      sendReady: d.status === 'APPROVED' && d.approvedVersion === d.version,
      leadName: d.lead?.contact?.name, consentStatus: d.lead?.contact?.consentStatus,
    };
  }

  /* ───────────── create / edit ───────────── */

  async create(user: AuthUser, input: { leadId: string; generate: boolean; subject?: string; body?: string }) {
    const lead = found(await this.prisma.lead.findFirst({ where: { id: input.leadId, tenantId: user.tenantId }, include: { contact: true } }), 'Lead');
    this.assertCanContact(lead.contact);
    let subject = input.subject;
    let body = input.body;
    let aiSource: string | null = null;
    if (input.generate) {
      const g = await this.leads.generateDraftContent(user, lead.id);
      subject = g.subject;
      body = g.body + OPT_OUT_FOOTER;
      aiSource = g.source;
    } else if (!subject || !body) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'subject and body are required when generate=false' });
    }
    const draft = await this.prisma.$transaction(async (tx) => {
      const d = await tx.communicationDraft.create({ data: { tenantId: user.tenantId, leadId: lead.id, recipient: lead.contact.email!, subject: subject!, body: body!, status: 'PENDING_REVIEW', aiGenerated: input.generate, aiSource, createdBy: user.id } });
      await tx.approvalRequest.create({ data: { tenantId: user.tenantId, resourceType: 'COMMUNICATION_DRAFT', resourceId: d.id, requestedBy: user.id } });
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: d.id, leadId: lead.id, action: 'email.draft_created', metadata: { aiGenerated: input.generate, aiSource } }, tx);
      return d;
    });
    return this.view(draft);
  }

  /** Contact must have a deliverable address and active consent. Marketing/follow-up drafts are blocked otherwise. */
  assertCanContact(contact: { email: string | null; consentStatus: string }) {
    if (!contact.email) throw new UnprocessableEntityException({ code: 'NO_EMAIL', message: 'This contact has no email address' });
    if (contact.consentStatus === 'WITHDRAWN') throw new ConflictException({ code: 'CONSENT_WITHDRAWN', message: 'The contact has withdrawn consent. Do not contact them.' });
    if (contact.consentStatus !== 'GRANTED') throw new ConflictException({ code: 'CONSENT_REQUIRED', message: 'No recorded consent to contact this person by email. Capture consent first.' });
  }

  async list(user: AuthUser, q: { page: number; pageSize: number; status?: string; leadId?: string }) {
    const where: any = { tenantId: user.tenantId, ...(q.status ? { status: q.status } : {}), ...(q.leadId ? { leadId: q.leadId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.communicationDraft.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(q.page, q.pageSize), include: { lead: { include: { contact: true } } } }),
      this.prisma.communicationDraft.count({ where }),
    ]);
    return paged(rows.map((r) => this.view(r)), total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    return this.view(found(await this.rawDraft(user.tenantId, id), 'Draft'));
  }

  /** Any content edit bumps the version and voids a previous approval. */
  async edit(user: AuthUser, id: string, patch: { subject?: string; body?: string }) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');
    if (['SENT', 'SENDING'].includes(d.status)) throw new ConflictException({ code: 'INVALID_STATE', message: 'A sent or sending message cannot be edited' });
    if (patch.subject === undefined && patch.body === undefined) return this.view(d);
    const changed = (patch.subject !== undefined && patch.subject !== d.subject) || (patch.body !== undefined && patch.body !== d.body);
    if (!changed) return this.view(d);
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.communicationDraft.updateMany({
        where: { id, tenantId: user.tenantId, version: d.version, status: { notIn: ['SENT', 'SENDING'] } },
        data: { subject: patch.subject ?? d.subject, body: patch.body ?? d.body, version: { increment: 1 }, status: 'DRAFT', approvedVersion: null, approvedBy: null, approvedAt: null, lastError: null },
      });
      if (res.count !== 1) throw new ConflictException({ code: 'EDIT_CONFLICT', message: 'The draft changed while you were editing. Reload and retry.' });
      await tx.approvalRequest.updateMany({ where: { tenantId: user.tenantId, resourceType: 'COMMUNICATION_DRAFT', resourceId: id, status: 'PENDING_REVIEW' }, data: { status: 'REJECTED', reviewNotes: 'Superseded: draft was edited', reviewedAt: new Date() } });
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: d.approvedVersion != null ? 'email.approval_invalidated' : 'email.draft_edited', metadata: { newVersion: d.version + 1 } }, tx);
      return tx.communicationDraft.findFirstOrThrow({ where: { id }, include: { lead: { include: { contact: true } } } });
    });
    return this.view(updated);
  }

  async requestApproval(user: AuthUser, id: string) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');
    if (!['DRAFT', 'REJECTED'].includes(d.status)) throw new ConflictException({ code: 'INVALID_STATE', message: `Cannot request approval while ${d.status}` });
    this.assertCanContact(d.lead.contact);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.communicationDraft.update({ where: { id }, data: { status: 'PENDING_REVIEW', lastError: null } });
      await tx.approvalRequest.create({ data: { tenantId: user.tenantId, resourceType: 'COMMUNICATION_DRAFT', resourceId: id, requestedBy: user.id } });
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: 'email.approval_requested' }, tx);
      return tx.communicationDraft.findFirstOrThrow({ where: { id }, include: { lead: { include: { contact: true } } } });
    });
    return this.view(updated);
  }

  /* ───────────── approve / reject ───────────── */

  async approve(user: AuthUser, id: string, notes?: string) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');
    if (d.status !== 'PENDING_REVIEW') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only drafts pending review can be approved' });
    this.assertCanContact(d.lead.contact);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // bind the approval to the exact version the reviewer saw
      const res = await tx.communicationDraft.updateMany({ where: { id, tenantId: user.tenantId, status: 'PENDING_REVIEW', version: d.version }, data: { status: 'APPROVED', approvedVersion: d.version, approvedBy: user.id, approvedAt: now, lastError: null } });
      if (res.count !== 1) throw new ConflictException({ code: 'APPROVAL_CONFLICT', message: 'The draft changed or was already reviewed' });
      await tx.approvalRequest.updateMany({ where: { tenantId: user.tenantId, resourceType: 'COMMUNICATION_DRAFT', resourceId: id, status: 'PENDING_REVIEW' }, data: { status: 'APPROVED', reviewedBy: user.id, reviewedAt: now, reviewNotes: notes ?? null } });
      await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'email.approved', resourceType: 'communication_draft', resourceId: id, metadata: { version: d.version } }, tx);
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: 'email.approved', metadata: { version: d.version } }, tx);
    });

    // Step 8: create/update the Gmail draft. Failure does not undo the human decision; it blocks nothing but is reported honestly.
    let gmailDraft: { state: 'CREATED' | 'NOT_CONNECTED' | 'REVOKED' | 'FAILED'; message?: string } = { state: 'NOT_CONNECTED', message: 'Gmail is not connected; sending is blocked until a Google account is connected.' };
    const { conn, state } = await this.integrations.getActiveConnection(user.tenantId);
    if (state === 'REVOKED') gmailDraft = { state: 'REVOKED', message: 'The Google connection was revoked. Reconnect to send.' };
    if (conn) {
      try {
        const raw = buildRawMessage({ from: conn.accountIdentifier, to: d.recipient, subject: d.subject, body: d.body, html: renderEmailHtml({ subject: d.subject, body: d.body, businessName: await this.businessName(user.tenantId) }) });
        const { draftId } = await this.gmail.upsertDraft(conn, raw, d.providerDraftId);
        await this.prisma.communicationDraft.update({ where: { id }, data: { providerDraftId: draftId } });
        gmailDraft = { state: 'CREATED' };
      } catch (e) {
        const ge = e instanceof GmailError ? e : new GmailError(scrubSecrets((e as Error).message), 'FATAL');
        if (ge.kind === 'AUTH_REVOKED') await this.integrations.markRevoked(user.tenantId, conn.id, ge.message);
        gmailDraft = { state: ge.kind === 'AUTH_REVOKED' ? 'REVOKED' : 'FAILED', message: ge.message };
      }
    }
    return { ...this.view(found(await this.rawDraft(user.tenantId, id))), gmailDraft };
  }

  async reject(user: AuthUser, id: string, notes?: string) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');
    if (d.status !== 'PENDING_REVIEW') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only drafts pending review can be rejected' });
    await this.prisma.$transaction(async (tx) => {
      await tx.communicationDraft.update({ where: { id }, data: { status: 'REJECTED', approvedVersion: null, approvedBy: null, approvedAt: null, lastError: notes ?? null } });
      await tx.approvalRequest.updateMany({ where: { tenantId: user.tenantId, resourceType: 'COMMUNICATION_DRAFT', resourceId: id, status: 'PENDING_REVIEW' }, data: { status: 'REJECTED', reviewedBy: user.id, reviewedAt: new Date(), reviewNotes: notes ?? null } });
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: 'email.rejected' }, tx);
    });
    return this.get(user, id);
  }

  /* ───────────── send (separate, deliberate action) ───────────── */

  /** Short-lived token proving a human pressed "Confirm send" for this exact version. Used by the n8n send workflow. */
  async issueSendConfirmation(user: AuthUser, id: string) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');
    if (d.status !== 'APPROVED' || d.approvedVersion !== d.version) throw new ConflictException({ code: 'NOT_APPROVED', message: 'Draft is not approved for its current version' });
    return { token: signPayload({ k: 'send', d: id, v: d.version, u: user.id, t: user.tenantId }, this.env.URL_SIGNING_SECRET, 600), expiresInSeconds: 600 };
  }

  async sendWithConfirmation(tenantId: string, token: string) {
    const c = verifyPayload<{ k: string; d: string; v: number; u: string; t: string }>(token, this.env.URL_SIGNING_SECRET);
    if (!c || c.k !== 'send' || c.t !== tenantId) throw new ForbiddenException({ code: 'CONFIRMATION_INVALID', message: 'Send confirmation is missing, invalid or expired' });
    const u = await this.prisma.user.findFirst({ where: { id: c.u, tenantId, status: 'ACTIVE' } });
    if (!u) throw new ForbiddenException({ code: 'CONFIRMATION_INVALID', message: 'Confirming user is not active' });
    const user: AuthUser = { id: u.id, tenantId, role: u.role as AuthUser['role'], email: u.email, fullName: u.fullName };
    return this.send(user, c.d, { idempotencyKey: `confirm-${c.d}-v${c.v}`, version: c.v });
  }

  async send(user: AuthUser, id: string, input: { idempotencyKey: string; version: number }) {
    const d = found(await this.rawDraft(user.tenantId, id), 'Draft');

    // Idempotency: a repeat of an already-completed send returns the original result, never a second email.
    if (d.status === 'SENT') {
      if (d.sendIdempotencyKey === input.idempotencyKey) return { ...this.view(d), duplicate: true };
      throw new ConflictException({ code: 'ALREADY_SENT', message: 'This message has already been sent' });
    }
    if (d.status === 'SENDING') throw new ConflictException({ code: 'SEND_IN_PROGRESS', message: 'A send for this draft is already in progress' });
    if (!['APPROVED', 'SEND_FAILED'].includes(d.status) || d.approvedVersion == null) throw new ConflictException({ code: 'NOT_APPROVED', message: 'This message has not been approved and cannot be sent' });
    if (d.approvedVersion !== d.version || input.version !== d.version) throw new ConflictException({ code: 'APPROVAL_STALE', message: 'The approved version no longer matches the current content. Request approval again.' });

    // Re-verify messaging rules at send time (consent may have changed since approval)
    this.assertCanContact(d.lead.contact);
    if (d.lead.contact.email!.toLowerCase() !== d.recipient.toLowerCase()) throw new ConflictException({ code: 'RECIPIENT_CHANGED', message: 'Contact email changed since approval. Re-approve the draft.' });
    const sentToday = await this.prisma.communicationDraft.count({ where: { tenantId: user.tenantId, status: 'SENT', sentAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (sentToday >= DAILY_SEND_LIMIT) throw new HttpException({ code: 'DAILY_LIMIT', message: 'Daily sending limit reached for this workspace' }, 429);

    const { conn, state } = await this.integrations.getActiveConnection(user.tenantId);
    if (!conn) {
      throw new ConflictException({ code: state === 'REVOKED' ? 'INTEGRATION_REVOKED' : 'INTEGRATION_NOT_CONNECTED', message: state === 'REVOKED' ? 'The Google connection was revoked. Reconnect Gmail in Settings.' : 'Gmail is not connected. Connect a Google account in Settings before sending.' });
    }

    // Atomic claim: only one request can move APPROVED → SENDING for this exact version.
    let claimed;
    try {
      claimed = await this.prisma.communicationDraft.updateMany({
        where: { id, tenantId: user.tenantId, version: d.version, approvedVersion: d.version, status: { in: ['APPROVED', 'SEND_FAILED'] } },
        data: { status: 'SENDING', sendIdempotencyKey: input.idempotencyKey, sendAttempts: { increment: 1 }, lastError: null, sentBy: user.id },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'This idempotency key was used for a different message' });
      throw e;
    }
    if (claimed.count !== 1) throw new ConflictException({ code: 'SEND_IN_PROGRESS', message: 'Another send request is already processing this draft' });

    try {
      const raw = buildRawMessage({ from: conn.accountIdentifier, to: d.recipient, subject: d.subject, body: d.body, html: renderEmailHtml({ subject: d.subject, body: d.body, businessName: await this.businessName(user.tenantId) }) });
      const sent = await this.withRetry(async () => {
        const { draftId } = await this.gmail.upsertDraft(conn, raw, d.providerDraftId); // make Gmail hold exactly the approved content
        if (draftId !== d.providerDraftId) await this.prisma.communicationDraft.update({ where: { id }, data: { providerDraftId: draftId } });
        return this.gmail.sendDraft(conn, draftId);
      });
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.communicationDraft.update({ where: { id }, data: { status: 'SENT', providerMessageId: sent.messageId, sentAt: now, sentBy: user.id } });
        await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'email.sent', resourceType: 'communication_draft', resourceId: id, metadata: { gmailMessageId: sent.messageId, version: d.version, idempotencyKey: input.idempotencyKey } }, tx);
        await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: 'email.sent', metadata: { gmailMessageId: sent.messageId, subject: d.subject } }, tx);
        if (['NEW', 'QUALIFIED'].includes(d.lead.status)) {
          await tx.lead.update({ where: { id: d.leadId }, data: { status: 'CONTACTED' } });
          await tx.opportunity.updateMany({ where: { tenantId: user.tenantId, leadId: d.leadId, stage: { in: ['NEW', 'QUALIFIED'] } }, data: { stage: 'CONTACTED' } });
          await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'lead', entityId: d.leadId, leadId: d.leadId, action: 'lead.stage_changed', metadata: { from: d.lead.status, to: 'CONTACTED', reason: 'email_sent' } }, tx);
        }
      });
      return { ...this.view(found(await this.rawDraft(user.tenantId, id))), duplicate: false };
    } catch (e) {
      const ge = e instanceof GmailError ? e : new GmailError(scrubSecrets((e as Error).message), 'FATAL');
      await this.prisma.communicationDraft.update({ where: { id }, data: { status: 'SEND_FAILED', lastError: ge.message } });
      await this.audit.activity({ tenantId: user.tenantId, actorId: user.id, entityType: 'communication_draft', entityId: id, leadId: d.leadId, action: 'email.send_failed', metadata: { kind: ge.kind } });
      if (ge.kind === 'AUTH_REVOKED') {
        await this.integrations.markRevoked(user.tenantId, conn.id, ge.message);
        throw new ConflictException({ code: 'INTEGRATION_REVOKED', message: ge.message });
      }
      if (ge.kind === 'RATE_LIMITED') throw new HttpException({ code: 'PROVIDER_RATE_LIMITED', message: ge.message }, 429);
      throw new HttpException({ code: ge.kind === 'TRANSIENT' ? 'PROVIDER_UNAVAILABLE' : 'SEND_FAILED', message: ge.message }, ge.kind === 'TRANSIENT' ? 503 : 502);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const retryable = e instanceof GmailError && (e.kind === 'RATE_LIMITED' || e.kind === 'TRANSIENT');
        if (!retryable || i === RETRY_DELAYS_MS.length) break;
        await new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 5 : RETRY_DELAYS_MS[i]));
      }
    }
    throw last;
  }
}

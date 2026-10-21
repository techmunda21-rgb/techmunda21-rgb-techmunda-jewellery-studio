import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { COMMUNICATION_APPROVER_ROLES, COMMUNICATION_SENDER_ROLES, draftCreateSchema, draftReviewSchema, draftSendSchema, draftUpdateSchema, paginationSchema } from '@techmunda/shared';
import { z } from 'zod';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { CommunicationsService } from './communications.service';

const listQuery = paginationSchema.extend({ status: z.string().max(20).optional(), leadId: z.string().uuid().optional() });
const AUTHORS = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'SALES_EXECUTIVE'] as const;

@ApiTags('Communications')
@Controller('communications/drafts')
export class CommunicationsController {
  constructor(private readonly svc: CommunicationsService) {}

  @Post()
  @Roles(...AUTHORS)
  @Doc('Create an email draft (AI-written or manual). Saved as PENDING_REVIEW — never sent.', draftCreateSchema)
  create(@CurrentUser() u: AuthUser, @Body(zod(draftCreateSchema)) b: any) {
    return this.svc.create(u, b);
  }

  @Get()
  @Doc('List drafts')
  list(@CurrentUser() u: AuthUser, @Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(u, q);
  }

  @Get(':id')
  @Doc('Get a draft')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @Patch(':id')
  @Roles(...AUTHORS)
  @Doc('Edit a draft — invalidates any previous approval', draftUpdateSchema)
  edit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(draftUpdateSchema)) b: any) {
    return this.svc.edit(u, id, b);
  }

  @Post(':id/request-approval')
  @HttpCode(200)
  @Roles(...AUTHORS)
  @Doc('Submit an edited/rejected draft for approval')
  request(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.requestApproval(u, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(...COMMUNICATION_APPROVER_ROLES)
  @Doc('Approve the current version and create/update the Gmail draft. Does NOT send.', draftReviewSchema)
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(draftReviewSchema)) b: { notes?: string }) {
    return this.svc.approve(u, id, b.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(...COMMUNICATION_APPROVER_ROLES)
  @Doc('Reject a draft', draftReviewSchema)
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(draftReviewSchema)) b: { notes?: string }) {
    return this.svc.reject(u, id, b.notes);
  }

  @Post(':id/send')
  @HttpCode(200)
  @Roles(...COMMUNICATION_SENDER_ROLES)
  @Doc('Deliberately send an approved draft through Gmail (idempotent)', draftSendSchema)
  send(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(draftSendSchema)) b: { idempotencyKey: string; version: number }) {
    return this.svc.send(u, id, b);
  }

  @Post(':id/send-confirmation')
  @HttpCode(200)
  @Roles(...COMMUNICATION_SENDER_ROLES)
  @Doc('Issue a short-lived send confirmation (for the n8n approved-send workflow)')
  confirmation(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.issueSendConfirmation(u, id);
  }
}

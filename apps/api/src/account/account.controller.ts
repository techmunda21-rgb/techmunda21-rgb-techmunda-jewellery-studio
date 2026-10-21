import { Body, Controller, Delete, Get, HttpCode, Inject, UnauthorizedException, ForbiddenException, Logger, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { accountDeleteSchema, POLICY_VERSION } from '@techmunda/shared';
import { deleteTenantCompletely } from '@techmunda/core';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { num } from '../common/helpers';
import { ENV, PRISMA, STORAGE, type AppEnv, type AppStorage, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';

@ApiTags('Account')
@Controller('account')
export class AccountController {
  private readonly logger = new Logger('Account');
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(STORAGE) private readonly storage: AppStorage, @Inject(ENV) private readonly env: AppEnv) {}

  @Get('privacy')
  @Doc('Privacy status of my account and workspace')
  async privacy(@CurrentUser() u: AuthUser) {
    const [user, tenant, acc] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } }),
      this.prisma.policyAcceptance.findFirst({ where: { tenantId: u.tenantId, userId: u.id }, orderBy: { acceptedAt: 'desc' } }),
    ]);
    return {
      policyVersionCurrent: POLICY_VERSION, acceptedVersion: acc?.policyVersion ?? null, acceptedAt: acc?.acceptedAt ?? null, marketingOptIn: acc?.marketingOptIn ?? false,
      emailVerified: !!user.emailVerifiedAt, phoneVerified: !!user.phoneVerifiedAt, isDemo: tenant.isDemo, demoExpiresAt: tenant.demoExpiresAt, retentionDays: this.env.DEMO_RETENTION_DAYS,
      canDeleteWorkspace: tenant.isDemo && ['TENANT_OWNER'].includes(u.role),
    };
  }

  /** Right of access / portability: everything this workspace holds, as JSON. */
  @Get('export')
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER')
  @Doc('Download all data held for my workspace (JSON)')
  async export(@CurrentUser() u: AuthUser, @Res() res: Response) {
    const t = u.tenantId;
    const w = { tenantId: t };
    const [tenant, users, products, contacts, leads, notes, tasks, opps, drafts, activities, accept, campaigns] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: t }, select: { name: true, slug: true, country: true, currency: true, timezone: true, isDemo: true, demoExpiresAt: true, createdAt: true } }),
      this.prisma.user.findMany({ where: w, select: { fullName: true, email: true, phone: true, role: true, emailVerifiedAt: true, phoneVerifiedAt: true, createdAt: true } }),
      this.prisma.product.findMany({ where: w }), this.prisma.contact.findMany({ where: w }), this.prisma.lead.findMany({ where: w }), this.prisma.leadNote.findMany({ where: w }),
      this.prisma.task.findMany({ where: w }), this.prisma.opportunity.findMany({ where: w }),
      this.prisma.communicationDraft.findMany({ where: w, select: { id: true, leadId: true, recipient: true, subject: true, body: true, status: true, sentAt: true, createdAt: true } }),
      this.prisma.activityLog.findMany({ where: w, orderBy: { createdAt: 'asc' } }), this.prisma.policyAcceptance.findMany({ where: w }), this.prisma.campaign.findMany({ where: w }),
    ]);
    await this.prisma.auditLog.create({ data: { tenantId: t, actorId: u.id, action: 'account.exported', resourceType: 'tenant', resourceId: t } });
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), note: 'Images/PDFs are not embedded; they can be downloaded from the app.', tenant, users, products: products.map((p) => ({ ...p, weight: num(p.weight), price: num(p.price) })), contacts, leads, leadNotes: notes, tasks, opportunities: opps, emailDrafts: drafts, campaigns, activity: activities, policyAcceptances: accept }, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="techmunda-workspace-export.json"');
    res.send(body);
  }

  /** Right of erasure for self-service demo workspaces (seeded/customer workspaces are removed by Techmunda on request). */
  @Delete()
  @HttpCode(204)
  @Roles('TENANT_OWNER')
  @Doc('Permanently delete my demo workspace and all its data', accountDeleteSchema)
  async remove(@CurrentUser() u: AuthUser, @Body(zod(accountDeleteSchema)) b: { password: string }) {
    const [user, tenant] = await Promise.all([this.prisma.user.findUniqueOrThrow({ where: { id: u.id } }), this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId } })]);
    if (!tenant.isDemo) throw new ForbiddenException({ code: 'NOT_SELF_SERVICE', message: 'Only self-service demo workspaces can be deleted here. Email the support address to request deletion of this workspace.' });
    if (!(await bcrypt.compare(b.password, user.passwordHash))) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Password is incorrect' });
    await deleteTenantCompletely(this.prisma, this.storage, u.tenantId);
    this.logger.log(`demo workspace ${u.tenantId} deleted at the owner's request`);
  }
}

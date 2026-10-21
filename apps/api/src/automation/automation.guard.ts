import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { verifyHmacHex } from '@techmunda/core';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import { SecurityService } from '../security/security.service';

/** Per-tenant webhook secret: a workflow holding tenant A's secret can never act on tenant B. */
export function tenantWebhookSecret(masterSecret: string, tenantId: string): string {
  return createHmac('sha256', masterSecret).update(`tenant:${tenantId}`).digest('hex');
}

const MAX_SKEW_SECONDS = 300;

/** Validates x-tenant-id + x-automation-timestamp + x-automation-signature = HMAC-SHA256(secret, `${ts}.${rawBody}`). */
@Injectable()
export class AutomationGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: AppEnv, @Inject(PRISMA) private readonly prisma: PrismaDb, private readonly security: SecurityService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const tenantId = String(req.headers['x-tenant-id'] ?? '');
    const ts = String(req.headers['x-automation-timestamp'] ?? '');
    const sig = req.headers['x-automation-signature'] as string | undefined;
    const fail = () => {
      void this.security.report({ type: 'WEBHOOK_AUTH_FAILED', severity: 'HIGH', ip: req.ip, detail: { path: String(req.path).slice(0, 80) } });
      return new UnauthorizedException({ code: 'WEBHOOK_AUTH_FAILED', message: 'Invalid webhook signature' });
    };
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^\d{9,13}$/.test(ts)) throw fail();
    const tsSeconds = ts.length > 11 ? Math.floor(Number(ts) / 1000) : Number(ts);
    if (Math.abs(Date.now() / 1000 - tsSeconds) > MAX_SKEW_SECONDS) throw fail(); // replay window
    const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
    if (!verifyHmacHex(`${ts}.${raw}`, sig, tenantWebhookSecret(this.env.AUTOMATION_WEBHOOK_SECRET, tenantId))) throw fail();
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'ACTIVE' }, select: { id: true } });
    if (!tenant) throw fail();
    req.automationTenantId = tenantId;
    return true;
  }
}

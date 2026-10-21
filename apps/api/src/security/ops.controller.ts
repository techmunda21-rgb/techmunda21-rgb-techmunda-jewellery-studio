import { Body, Controller, Get, HttpException, Inject, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { ENV, type AppEnv } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { AuditService } from '../audit/audit.service';
import { OTP_DELIVERY, type OtpDelivery } from '../signup/otp-delivery';
import { IpBanService } from './ip-ban.service';
import { MailError, MailService } from './mail.service';
import { SecurityService } from './security.service';

const maskEmail = (e?: string | null) => (e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : null);
const testBody = z.object({ to: z.string().email().optional() });

/** Operator-only diagnostics for e-mail/OTP/alerting. Never returns a secret value — only whether each is set. */
@ApiTags('Operations')
@Controller('ops')
@Roles('PLATFORM_ADMIN')
export class OpsController {
  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    private readonly mail: MailService,
    private readonly security: SecurityService,
    private readonly bans: IpBanService,
    private readonly audit: AuditService,
    @Inject(OTP_DELIVERY) private readonly otp: OtpDelivery,
  ) {}

  @Get('readiness')
  @Doc('E-mail / SMS / OTP / alerting readiness (no secrets returned). ?verify=true also tests the SMTP login.')
  async readiness(@Query('verify') verify?: string) {
    const smtp = { mode: this.mail.viaApi() ? 'brevo-api' : 'smtp', configured: this.mail.isConfigured(), missing: this.mail.missing(), host: this.env.SMTP_HOST ?? null, port: this.env.SMTP_PORT, user: maskEmail(this.env.SMTP_USER), from: this.mail.from() || null, login: verify === 'true' ? await this.mail.verify() : null };
    const smsMissing = (['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const).filter((k) => !this.env[k]).concat(this.env.TWILIO_FROM || this.env.TWILIO_MESSAGING_SERVICE_SID ? [] : (['TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID'] as never[]));
    const channels = this.otp.channels();
    return {
      smtp,
      sms: { configured: smsMissing.length === 0, missing: smsMissing },
      signup: { enabled: this.env.SIGNUP_ENABLED && channels.length > 0, channels },
      alerts: { alertEmail: maskEmail(this.env.ALERT_EMAIL), canEmail: !!this.env.ALERT_EMAIL && smtp.configured, blockedIps: this.bans.count() },
      warnings: [
        ...(!smtp.configured ? ['SMTP is not configured: no e-mail OTP codes and no security alert e-mails can be sent.'] : []),
        ...(!this.env.ALERT_EMAIL ? ['ALERT_EMAIL is not set: security alerts are only written to the server log.'] : []),
        ...(this.env.ALLOW_INSECURE_OTP_CONSOLE ? ['ALLOW_INSECURE_OTP_CONSOLE is on (development only).'] : []),
      ],
    };
  }

  @Post('test-email')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Doc('Send a test e-mail through the configured SMTP (default recipient: ALERT_EMAIL)', testBody)
  async testEmail(@CurrentUser() u: AuthUser, @Body(zod(testBody)) b: { to?: string }) {
    const to = b.to ?? this.env.ALERT_EMAIL;
    if (!to) throw new HttpException({ code: 'NO_RECIPIENT', message: 'Provide a recipient or set ALERT_EMAIL' }, 400);
    try {
      await this.mail.send({ to, subject: 'Techmunda e-mail test ✔', text: 'This is a test message from your Techmunda server. SMTP is working, so verification codes and security alerts can be delivered.' });
    } catch (e) {
      const me = e as MailError;
      throw new HttpException({ code: me.code === 'NOT_CONFIGURED' ? 'SMTP_NOT_CONFIGURED' : 'SMTP_FAILED', message: me.message }, me.code === 'NOT_CONFIGURED' ? 409 : 502);
    }
    await this.audit.audit({ tenantId: u.tenantId, actorId: u.id, action: 'ops.test_email', resourceType: 'ops' });
    return { ok: true, sentTo: maskEmail(to) };
  }

  @Post('test-alert')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Doc('Fire a test security alert to ALERT_EMAIL')
  async testAlert(@CurrentUser() u: AuthUser) {
    if (!this.env.ALERT_EMAIL || !this.mail.isConfigured()) throw new HttpException({ code: 'ALERTS_NOT_CONFIGURED', message: 'Set ALERT_EMAIL and the SMTP variables first.' }, 409);
    await this.security.report({ type: 'TEST_ALERT', severity: 'LOW', userId: u.id, detail: { triggeredBy: maskEmail(u.email) } });
    return { ok: true, sentTo: maskEmail(this.env.ALERT_EMAIL) };
  }

  @Get('security-events')
  @Doc('Recent security events (platform admin)')
  async events() {
    return { data: await this.security.recent(100), blockedIps: this.bans.count() };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import { IpBanService } from './ip-ban.service';
import { MailService } from './mail.service';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SecurityEventType = 'LOGIN_FAILED' | 'REFRESH_TOKEN_REUSE' | 'FORGED_TOKEN' | 'WEBHOOK_AUTH_FAILED' | 'SCANNING' | 'OTP_LOCKOUT' | 'SIGNUP_ABUSE' | 'BOT_HONEYPOT' | 'TEST_ALERT';

interface Rule { windowMs: number; alertAt: number; banAt?: number; title: string; advice: string }
const RULES: Record<SecurityEventType, Rule> = {
  LOGIN_FAILED: { windowMs: 600_000, alertAt: 5, banAt: 15, title: 'Repeated failed logins (possible password guessing)', advice: 'If you do not recognise the IP, keep it blocked and make sure all demo/owner passwords are strong. Rotate DEMO_PASSWORD if the attack continues.' },
  REFRESH_TOKEN_REUSE: { windowMs: 3_600_000, alertAt: 1, title: 'A rotated refresh token was replayed (possible session theft)', advice: 'The affected session family was revoked automatically. Ask the user to sign in again and check their device.' },
  FORGED_TOKEN: { windowMs: 600_000, alertAt: 10, banAt: 30, title: 'Many invalid/forged access tokens', advice: 'Someone is sending tampered login tokens. If it persists, rotate JWT_ACCESS_SECRET in Render (this signs everyone out).' },
  WEBHOOK_AUTH_FAILED: { windowMs: 3_600_000, alertAt: 1, banAt: 20, title: 'Automation webhook called with a bad signature', advice: 'Your n8n secret may be mis-set — or someone is probing /automation. Rotate AUTOMATION_WEBHOOK_SECRET if unexpected.' },
  SCANNING: { windowMs: 120_000, alertAt: 1, banAt: 2, title: 'Burst of denied/not-found requests (scanner or enumeration)', advice: 'An automated scanner is probing the API. It is rate-limited and auto-blocked at higher volumes.' },
  OTP_LOCKOUT: { windowMs: 3_600_000, alertAt: 5, title: 'Signup verification codes being guessed', advice: 'Repeated OTP lockouts. Rate limits are active; consider disabling signup temporarily (SIGNUP_ENABLED=false).' },
  SIGNUP_ABUSE: { windowMs: 3_600_000, alertAt: 10, title: 'Signup rate limit hit repeatedly', advice: 'Possible SMS/e-mail bombing attempt. Consider SIGNUP_ENABLED=false until it stops.' },
  BOT_HONEYPOT: { windowMs: 3_600_000, alertAt: 50, title: 'Bot activity on public forms', advice: 'Bots are submitting the hidden honeypot field; they are being dropped silently.' },
  TEST_ALERT: { windowMs: 60_000, alertAt: 1, title: 'Test alert — alerting is working', advice: 'This is only a test triggered from Settings → Email & security.' },
};
const DEDUPE_MS = 15 * 60_000;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Records security events and e-mails the operator when a threshold is crossed (deduplicated per type+IP for 15 min).
 * Alerts contain the offending IP and counts — never passwords, tokens, OTPs or message bodies.
 * Report calls never throw: monitoring must not be able to break a request.
 */
@Injectable()
export class SecurityService {
  private readonly log = new Logger('Security');
  private readonly lastAlert = new Map<string, number>();
  private readonly denied = new Map<string, number[]>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv, private readonly mail: MailService, private readonly bans: IpBanService) {}

  hashIp(ip: string) {
    return createHmac('sha256', this.env.URL_SIGNING_SECRET).update(`ip:${ip}`).digest('hex').slice(0, 32);
  }

  async report(e: { type: SecurityEventType; severity?: Severity; ip?: string; tenantId?: string; userId?: string; detail?: Record<string, string | number | boolean | null> }) {
    try {
      const rule = RULES[e.type];
      const ipHash = e.ip ? this.hashIp(e.ip) : null;
      const severity: Severity = e.severity ?? 'MEDIUM';
      const row = await this.prisma.securityEvent.create({ data: { type: e.type, severity, ipHash, tenantId: e.tenantId, userId: e.userId, detail: e.detail } });
      const count = ipHash ? await this.prisma.securityEvent.count({ where: { type: e.type, ipHash, createdAt: { gte: new Date(Date.now() - rule.windowMs) } } }) : 1;

      let banned = false;
      if (e.ip && rule.banAt && count >= rule.banAt && !this.bans.isBanned(e.ip)) {
        this.bans.ban(e.ip);
        banned = true;
      }
      if (count < rule.alertAt && !banned) return;

      const key = `${e.type}:${e.ip ?? 'n/a'}`;
      const last = this.lastAlert.get(key) ?? 0;
      if (!banned && Date.now() - last < DEDUPE_MS) return;
      this.lastAlert.set(key, Date.now());
      await this.prisma.securityEvent.update({ where: { id: row.id }, data: { alerted: true } });
      await this.sendAlert({ ...e, severity: count >= (rule.banAt ?? Infinity) ? 'CRITICAL' : severity, count, banned });
    } catch (err) {
      this.log.error(`could not record security event: ${(err as Error).message}`);
    }
  }

  /** Sliding-window counter for 401/403/404/429 responses per IP. Cheap, in memory. */
  noteDenied(ip: string | undefined) {
    if (!ip) return;
    const now = Date.now();
    const arr = (this.denied.get(ip) ?? []).filter((t) => now - t < 60_000);
    arr.push(now);
    this.denied.set(ip, arr);
    if (this.denied.size > 5000) for (const [k, v] of this.denied) if (now - v[v.length - 1] > 60_000) this.denied.delete(k);
    // first report at 60 denied/min (alert), second at 150/min (alert + temporary block)
    if (arr.length === 60 || arr.length === 150) void this.report({ type: 'SCANNING', severity: 'HIGH', ip, detail: { deniedLastMinute: arr.length } });
  }

  private async sendAlert(a: { type: SecurityEventType; severity: Severity; ip?: string; detail?: Record<string, string | number | boolean | null>; count: number; banned: boolean }) {
    const rule = RULES[a.type];
    const to = this.env.ALERT_EMAIL;
    const lines = [
      `${a.severity} · ${rule.title}`,
      '',
      `Time:     ${new Date().toISOString()}`,
      `Event:    ${a.type}`,
      `Source IP: ${a.ip ?? 'unknown'}`,
      `Count:    ${a.count} in the last ${Math.round(rule.windowMs / 60_000)} min`,
      ...Object.entries(a.detail ?? {}).map(([k, v]) => `${k}: ${v}`),
      `Action:   ${a.banned ? 'IP temporarily blocked for 1 hour' : 'logged (no automatic block)'}`,
      '',
      `What to do: ${rule.advice}`,
      '',
      'Full history: Settings → Email & security (platform admin).',
    ];
    this.log.warn(`SECURITY ALERT ${a.severity} ${a.type} ip=${a.ip ?? 'n/a'} count=${a.count}${a.banned ? ' BANNED' : ''}`);
    if (!to) return this.log.warn('ALERT_EMAIL is not set — alert was logged but not e-mailed');
    if (!this.mail.isConfigured()) return this.log.warn('SMTP is not configured — alert was logged but not e-mailed');
    try {
      await this.mail.send({
        to, subject: `[Techmunda Security] ${a.severity}: ${rule.title}`, text: lines.join('\n'),
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;border:1px solid #B88A36;border-radius:10px;overflow:hidden"><div style="background:${a.severity === 'CRITICAL' ? '#780514' : '#461318'};color:#F8EEDB;padding:14px 18px;font-size:16px">${esc(a.severity)} · ${esc(rule.title)}</div><pre style="margin:0;padding:16px 18px;font:13px/1.6 Consolas,monospace;white-space:pre-wrap;color:#351B1D;background:#FFF9EF">${esc(lines.slice(2).join('\n'))}</pre></div>`,
      });
    } catch (e) {
      this.log.error(`alert e-mail failed: ${(e as Error).message}`);
    }
  }

  recent(limit = 100) {
    return this.prisma.securityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}

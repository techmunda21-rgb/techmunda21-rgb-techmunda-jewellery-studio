import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { scrubSecrets, type Env } from '@techmunda/core';
import { ENV, type AppEnv } from '../common/tokens';

export class MailError extends Error {
  constructor(message: string, public readonly code: 'NOT_CONFIGURED' | 'AUTH' | 'CONNECTION' | 'REJECTED') {
    super(message);
  }
}

/** The single place that talks SMTP (OTP codes, security alerts, test e-mails). */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  constructor(@Inject(ENV) private readonly env: AppEnv | Env) {}

  isConfigured() {
    return this.viaApi() || !!(this.env.SMTP_HOST && this.env.SMTP_USER && this.env.SMTP_PASS);
  }
  /** HTTPS API mode (works where outbound SMTP ports are blocked). */
  viaApi() {
    return !!this.env.BREVO_API_KEY;
  }
  missing() {
    if (this.viaApi()) return [];
    return (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const).filter((k) => !this.env[k]);
  }
  from() {
    return this.env.SMTP_FROM ?? this.env.SMTP_USER ?? '';
  }

  private transport() {
    return createTransport({ host: this.env.SMTP_HOST, port: this.env.SMTP_PORT, secure: this.env.SMTP_PORT === 465, auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
  }

  /** Friendly, secret-free explanation of an SMTP failure. */
  private explain(e: unknown): MailError {
    const err = e as { code?: string; responseCode?: number; message?: string };
    const msg = scrubSecrets(err.message ?? 'unknown error');
    if (err.code === 'EAUTH' || err.responseCode === 535) return new MailError('SMTP login was rejected. For Gmail use a 16-character App Password (2-Step Verification must be on), not the account password.', 'AUTH');
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND', 'ECONNREFUSED', 'EDNS'].includes(err.code ?? '')) return new MailError('Could not reach the SMTP server. Check SMTP_HOST/SMTP_PORT (Gmail: smtp.gmail.com, 465).', 'CONNECTION');
    return new MailError(`The SMTP server rejected the message (${err.code ?? 'error'}): ${msg.slice(0, 160)}`, 'REJECTED');
  }

  private async sendViaApi(m: { to: string; subject: string; text: string; html?: string }) {
    const from = this.from();
    const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from);
    const sender = match ? { name: match[1]?.trim() || undefined, email: match[2].trim() } : { email: from.trim() };
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new MailError('Could not reach the e-mail API (api.brevo.com).', 'CONNECTION');
    }
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) throw new MailError('The e-mail API key was rejected (check BREVO_API_KEY and that the sender is verified in Brevo).', 'AUTH');
    const detail = scrubSecrets(((await res.text().catch(() => '')) || '').slice(0, 160));
    throw new MailError(`The e-mail API rejected the message (${res.status}): ${detail}`, 'REJECTED');
  }

  async send(m: { to: string; subject: string; text: string; html?: string }) {
    if (!this.isConfigured()) throw new MailError(`E-mail is not configured (missing ${this.missing().join(', ')})`, 'NOT_CONFIGURED');
    try {
      if (this.viaApi()) return await this.sendViaApi(m);
      await this.transport().sendMail({ from: this.from(), to: m.to, subject: m.subject, text: m.text, html: m.html });
    } catch (e) {
      const ex = e instanceof MailError ? e : this.explain(e);
      this.log.error(`send failed: ${ex.code}`);
      throw ex;
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: `Missing ${this.missing().join(', ')}` };
    if (this.viaApi()) {
      try {
        const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': this.env.BREVO_API_KEY!, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        return r.ok ? { ok: true } : { ok: false, error: 'The e-mail API key was rejected (check BREVO_API_KEY).' };
      } catch {
        return { ok: false, error: 'Could not reach the e-mail API (api.brevo.com).' };
      }
    }
    try {
      await this.transport().verify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.explain(e).message };
    }
  }
}

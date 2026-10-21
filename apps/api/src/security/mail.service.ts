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
    return !!(this.env.SMTP_HOST && this.env.SMTP_USER && this.env.SMTP_PASS);
  }
  missing() {
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

  async send(m: { to: string; subject: string; text: string; html?: string }) {
    if (!this.isConfigured()) throw new MailError(`E-mail is not configured (missing ${this.missing().join(', ')})`, 'NOT_CONFIGURED');
    try {
      await this.transport().sendMail({ from: this.from(), to: m.to, subject: m.subject, text: m.text, html: m.html });
    } catch (e) {
      const ex = this.explain(e);
      this.log.error(`send failed: ${ex.code}`);
      throw ex;
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: `Missing ${this.missing().join(', ')}` };
    try {
      await this.transport().verify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.explain(e).message };
    }
  }
}

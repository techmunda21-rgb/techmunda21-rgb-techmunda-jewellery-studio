import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { scrubSecrets, type Env } from '@techmunda/core';

export type OtpChannel = 'EMAIL' | 'SMS';
export interface OtpDelivery {
  channels(): OtpChannel[];
  /** Throws if the provider rejects the message. Never log or return the code. */
  send(channel: OtpChannel, to: string, code: string): Promise<void>;
}
export const OTP_DELIVERY = 'OTP_DELIVERY';

const log = new Logger('OtpDelivery');
const brand = { maroon: '#461318', gold: '#B88A36', cream: '#F8EEDB', ivory: '#FFF9EF', ink: '#351B1D', royal: '#780514' };

function emailHtml(code: string) {
  return `<!doctype html><html><body style="margin:0;background:${brand.cream};padding:24px 12px;font-family:Arial,sans-serif;color:${brand.ink}">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:${brand.ivory};border:1px solid ${brand.gold};border-radius:12px;overflow:hidden">
<tr><td align="center" style="background:${brand.maroon};padding:22px;border-bottom:3px solid ${brand.gold};color:${brand.cream};font-family:Georgia,serif;font-size:24px;letter-spacing:1px">Techmunda</td></tr>
<tr><td style="padding:30px 32px"><p style="margin:0 0 14px;font-size:15px">Your verification code for the Techmunda demo workspace:</p>
<p style="margin:0 0 18px;text-align:center;font-family:Georgia,serif;font-size:36px;letter-spacing:10px;color:${brand.royal};font-weight:bold">${code}</p>
<p style="margin:0;font-size:13px;color:#705250;line-height:1.6">It expires in 10 minutes. Never share this code — Techmunda will never ask for it. If you did not request it, ignore this email.</p></td></tr></table></body></html>`;
}

/** Production delivery: SMTP e-mail (works with a Gmail app password) and Twilio SMS. Channels exist only when configured. */
export class ProviderOtpDelivery implements OtpDelivery {
  constructor(private readonly env: Env) {}
  private smtp = () => !!(this.env.SMTP_HOST && this.env.SMTP_USER && this.env.SMTP_PASS);
  private twilio = () => !!(this.env.TWILIO_ACCOUNT_SID && this.env.TWILIO_AUTH_TOKEN && (this.env.TWILIO_FROM || this.env.TWILIO_MESSAGING_SERVICE_SID));
  /** The console mode is for local development only. It is refused on hosted platforms and in production. */
  consoleAllowed = () => this.env.ALLOW_INSECURE_OTP_CONSOLE && this.env.NODE_ENV !== 'production' && !process.env.RENDER && !process.env.RAILWAY_ENVIRONMENT && !process.env.VERCEL;

  channels(): OtpChannel[] {
    if (this.consoleAllowed()) return ['EMAIL', 'SMS'];
    return [...(this.smtp() ? (['EMAIL'] as const) : []), ...(this.twilio() ? (['SMS'] as const) : [])];
  }

  async send(channel: OtpChannel, to: string, code: string) {
    if (!this.channels().includes(channel)) throw new ServiceUnavailableException({ code: 'OTP_CHANNEL_UNAVAILABLE', message: 'This verification method is not available right now' });
    if (this.consoleAllowed() && !(channel === 'EMAIL' ? this.smtp() : this.twilio())) {
      log.warn(`[DEV ONLY] ${channel} OTP for ${to.replace(/.(?=.{3})/g, '*')}: ${code}`);
      return;
    }
    try {
      if (channel === 'EMAIL') {
        const t = createTransport({ host: this.env.SMTP_HOST, port: this.env.SMTP_PORT, secure: this.env.SMTP_PORT === 465, auth: { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS }, connectionTimeout: 10_000 });
        await t.sendMail({ from: this.env.SMTP_FROM ?? this.env.SMTP_USER, to, subject: 'Your Techmunda verification code', text: `Your Techmunda demo verification code is ${code}. It expires in 10 minutes. Never share it.`, html: emailHtml(code) });
      } else {
        const sid = this.env.TWILIO_ACCOUNT_SID!;
        const body = new URLSearchParams({ To: to, Body: `Techmunda code: ${code}. Valid for 10 minutes. Do not share it.` });
        if (this.env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', this.env.TWILIO_MESSAGING_SERVICE_SID);
        else body.set('From', this.env.TWILIO_FROM!);
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${this.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
      }
    } catch (e) {
      log.error(`OTP delivery via ${channel} failed: ${scrubSecrets((e as Error).message)}`);
      throw new ServiceUnavailableException({ code: 'OTP_DELIVERY_FAILED', message: 'We could not send the code. Check the address/number or try the other method.' });
    }
  }
}

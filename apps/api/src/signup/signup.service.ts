import { BadRequestException, ConflictException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { POLICY_VERSION, type signupStartSchema } from '@techmunda/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import { OTP_DELIVERY, type OtpChannel, type OtpDelivery } from './otp-delivery';

const OTP_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const mask = (channel: OtpChannel, to: string) => (channel === 'EMAIL' ? to.replace(/^(.).*(@.*)$/, '$1•••$2') : to.replace(/.(?=.{3}$)/g, '•'));
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';

@Injectable()
export class SignupService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaDb,
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(OTP_DELIVERY) private readonly delivery: OtpDelivery,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  config() {
    const channels = this.env.SIGNUP_ENABLED ? this.delivery.channels() : [];
    return {
      enabled: channels.length > 0,
      channels,
      policyVersion: POLICY_VERSION,
      retentionDays: this.env.DEMO_RETENTION_DAYS,
      blockedReason: !this.env.SIGNUP_ENABLED ? 'Signup is switched off on this server.' : channels.length === 0 ? 'Signup is unavailable: no verification channel (e-mail SMTP or SMS) is configured on this server, so codes cannot be delivered.' : null,
    };
  }

  private hashIp(ip: string) {
    return createHmac('sha256', this.env.URL_SIGNING_SECRET).update(`ip:${ip}`).digest('hex').slice(0, 32);
  }
  /** HMAC with a server secret + the request id: a leaked row cannot be brute-forced offline without the secret. */
  private hashOtp(requestId: string, code: string) {
    return createHmac('sha256', this.env.URL_SIGNING_SECRET).update(`otp:${requestId}:${code}`).digest('hex');
  }
  private same(a: string, b: string) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  private newCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async start(input: z.infer<typeof signupStartSchema>, ip: string) {
    const cfg = this.config();
    if (!cfg.enabled) throw new ServiceUnavailableException({ code: 'SIGNUP_UNAVAILABLE', message: cfg.blockedReason });
    if (!cfg.channels.includes(input.channel)) throw new BadRequestException({ code: 'CHANNEL_UNAVAILABLE', message: `Verification by ${input.channel === 'SMS' ? 'mobile' : 'e-mail'} is not available. Choose ${cfg.channels[0] === 'SMS' ? 'mobile' : 'e-mail'}.` });
    if (input.website) return { requestId: randomUUID(), channel: input.channel, sentTo: mask(input.channel, input.channel === 'EMAIL' ? input.email : input.phone), expiresInSeconds: 600, resendAfterSeconds: 60 }; // honeypot: pretend

    const ipHash = this.hashIp(ip);
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [byIp, byEmail] = await Promise.all([
      this.prisma.signupRequest.count({ where: { ipHash, createdAt: { gte: hourAgo } } }),
      this.prisma.signupRequest.count({ where: { email: input.email, createdAt: { gte: hourAgo } } }),
    ]);
    if (byIp >= 5 || byEmail >= 3) throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many signup attempts. Please try again in an hour.' }, 429);

    const taken = await this.prisma.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] }, select: { id: true } });
    if (taken) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'An account with this e-mail or mobile number already exists. Please sign in instead.' });

    const requestId = randomUUID();
    const code = this.newCode();
    const to = input.channel === 'EMAIL' ? input.email : input.phone;
    // Deliver first: if the provider fails nothing is stored.
    await this.delivery.send(input.channel, to, code);
    const now = new Date();
    await this.prisma.signupRequest.create({
      data: {
        id: requestId, email: input.email, phone: input.phone, fullName: input.fullName, businessName: input.businessName, country: input.country,
        passwordHash: await bcrypt.hash(input.password, 12), channel: input.channel, otpHash: this.hashOtp(requestId, code), otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        lastSentAt: now, policyVersion: input.policyVersion, marketingOptIn: input.marketingOptIn, ipHash,
      },
    });
    return { requestId, channel: input.channel, sentTo: mask(input.channel, to), expiresInSeconds: OTP_TTL_MS / 1000, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
  }

  async resend(requestId: string) {
    const r = await this.prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!r || r.status !== 'PENDING') throw new BadRequestException({ code: 'REQUEST_INVALID', message: 'This signup session is no longer valid. Please start again.' });
    const wait = r.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) throw new HttpException({ code: 'RESEND_COOLDOWN', message: `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.` }, 429);
    if (r.resendCount >= MAX_RESENDS) throw new HttpException({ code: 'RESEND_LIMIT', message: 'Resend limit reached. Please start the signup again.' }, 429);
    const code = this.newCode();
    await this.delivery.send(r.channel as OtpChannel, r.channel === 'EMAIL' ? r.email : r.phone, code);
    await this.prisma.signupRequest.update({ where: { id: r.id }, data: { otpHash: this.hashOtp(r.id, code), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), lastSentAt: new Date(), resendCount: { increment: 1 }, attempts: 0 } });
    return { resendAfterSeconds: RESEND_COOLDOWN_MS / 1000, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async verify(requestId: string, code: string, ip: string) {
    const invalid = () => new BadRequestException({ code: 'CODE_INVALID', message: 'That code is not correct.' });
    const r = await this.prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!r || r.status === 'VERIFIED' || r.status === 'EXPIRED') throw new BadRequestException({ code: 'REQUEST_INVALID', message: 'This signup session is no longer valid. Please start again.' });
    if (r.status === 'LOCKED' || r.attempts >= MAX_ATTEMPTS) {
      await this.prisma.signupRequest.update({ where: { id: r.id }, data: { status: 'LOCKED' } });
      throw new HttpException({ code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect codes. Please start the signup again.' }, 429);
    }
    if (r.otpExpiresAt < new Date()) throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'The code has expired. Request a new one.' });

    if (!this.same(this.hashOtp(r.id, code), r.otpHash)) {
      const updated = await this.prisma.signupRequest.update({ where: { id: r.id }, data: { attempts: { increment: 1 } } });
      if (updated.attempts >= MAX_ATTEMPTS) await this.prisma.signupRequest.update({ where: { id: r.id }, data: { status: 'LOCKED' } });
      throw invalid();
    }

    // claim the request atomically so a code can only create one workspace
    const claimed = await this.prisma.signupRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'VERIFIED', otpHash: '', passwordHash: '' } });
    if (claimed.count !== 1) throw new BadRequestException({ code: 'REQUEST_INVALID', message: 'This signup session is no longer valid.' });

    const now = new Date();
    const currency = r.country === 'IN' ? 'INR' : r.country === 'AE' ? 'AED' : 'USD';
    let slug = `${slugify(r.businessName)}-${randomBytes(2).toString('hex')}`;
    const user = await this.prisma.$transaction(async (tx) => {
      while (await tx.tenant.findUnique({ where: { slug } })) slug = `${slugify(r.businessName)}-${randomBytes(3).toString('hex')}`;
      if (await tx.user.findFirst({ where: { OR: [{ email: r.email }, { phone: r.phone }] } })) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'An account with these details already exists.' });
      const tenant = await tx.tenant.create({ data: { name: r.businessName, slug, country: r.country === 'OTHER' ? 'IN' : r.country, currency, timezone: r.country === 'AE' ? 'Asia/Dubai' : 'Asia/Kolkata', isDemo: true, demoExpiresAt: new Date(now.getTime() + this.env.DEMO_RETENTION_DAYS * 86_400_000) } });
      const u = await tx.user.create({
        data: { tenantId: tenant.id, fullName: r.fullName, email: r.email, phone: r.phone, passwordHash: r.passwordHash, role: 'TENANT_OWNER', emailVerifiedAt: r.channel === 'EMAIL' ? now : null, phoneVerifiedAt: r.channel === 'SMS' ? now : null },
      });
      await tx.policyAcceptance.create({ data: { tenantId: tenant.id, userId: u.id, policyVersion: r.policyVersion, termsAccepted: true, privacyAccepted: true, marketingOptIn: r.marketingOptIn, ipHash: this.hashIp(ip) } });
      await this.audit.audit({ tenantId: tenant.id, actorId: u.id, action: 'signup.verified', resourceType: 'tenant', resourceId: tenant.id, metadata: { channel: r.channel, policyVersion: r.policyVersion } }, tx);
      return u;
    });
    // the (now empty) passwordHash on the request was consumed above; use the user row for the session
    return this.auth.startSession(user.id);
  }
}

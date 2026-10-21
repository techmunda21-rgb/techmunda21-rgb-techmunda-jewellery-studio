import { POLICY_VERSION } from '@techmunda/shared';
import { prisma } from '@techmunda/database';
import { ProviderOtpDelivery } from '../src/signup/otp-delivery';
import { createApp, login, resetWorld } from './helpers';

const base = (over: Record<string, unknown> = {}) => ({
  fullName: 'Riya Sethi', businessName: 'Signup Test Jewels', email: 'riya@example.com', phone: '+919876543210', country: 'IN', password: 'Sup3rSecret!x',
  channel: 'EMAIL', acceptTerms: true, acceptPrivacy: true, marketingOptIn: false, policyVersion: POLICY_VERSION, ...over,
});

describe('self-service signup with OTP verification', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => { await resetWorld(); ctx.otp.reset(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { name: 'Signup Test Jewels' } }); await ctx.app.close(); await prisma.$disconnect(); });

  const start = (b: Record<string, unknown> = {}) => ctx.http().post('/api/v1/public/signup/start').send(base(b));
  const verify = (requestId: string, code: string) => ctx.http().post('/api/v1/public/signup/verify').send({ requestId, code });

  it('reports available channels and the policy version', async () => {
    const r = await ctx.http().get('/api/v1/public/signup/config');
    expect(r.body).toMatchObject({ enabled: true, channels: ['EMAIL', 'SMS'], policyVersion: POLICY_VERSION });
    ctx.otp.available = [];
    const off = await ctx.http().get('/api/v1/public/signup/config');
    expect(off.body.enabled).toBe(false);
    expect(off.body.blockedReason).toMatch(/no verification channel/);
    const s = await start();
    expect(s.status).toBe(503);
    expect(s.body.error.code).toBe('SIGNUP_UNAVAILABLE');
    expect(ctx.otp.sent).toHaveLength(0);
  });

  it('requires explicit acceptance of the terms and privacy policy, a strong password and an international mobile number', async () => {
    for (const bad of [{ acceptTerms: false }, { acceptPrivacy: false }, { acceptTerms: undefined }, { policyVersion: '1999-01-01' }, { password: 'short1' }, { password: 'alllettersnodigits' }, { phone: '9876543210' }, { email: 'nope' }]) {
      expect((await start(bad)).status).toBe(400);
    }
    expect(ctx.otp.sent).toHaveLength(0);
    expect(await prisma.signupRequest.count()).toBe(0);
  });

  it('e-mail OTP happy path: nothing is created before verification; verifying creates a demo workspace, owner, consent record and a working session', async () => {
    const s = await start();
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ channel: 'EMAIL', sentTo: expect.stringMatching(/^r•••@example\.com$/), expiresInSeconds: 600 });
    expect(JSON.stringify(s.body)).not.toMatch(/\d{6}/); // the code is never returned
    const { code, to } = ctx.otp.last();
    expect(to).toBe('riya@example.com');
    expect(await prisma.user.count({ where: { email: 'riya@example.com' } })).toBe(0);
    const row = await prisma.signupRequest.findUniqueOrThrow({ where: { id: s.body.requestId } });
    expect(row.otpHash).not.toContain(code); // only an HMAC is stored
    expect(row.passwordHash).not.toContain('Sup3rSecret');

    const v = await verify(s.body.requestId, code);
    expect(v.status).toBe(200);
    expect(v.body.accessToken).toBeTruthy();
    const user = await prisma.user.findFirstOrThrow({ where: { email: 'riya@example.com' }, include: { tenant: true, policyAcceptances: true } });
    expect(user).toMatchObject({ role: 'TENANT_OWNER', phone: '+919876543210' });
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(user.phoneVerifiedAt).toBeNull();
    expect(user.tenant).toMatchObject({ isDemo: true, currency: 'INR', name: 'Signup Test Jewels' });
    expect(user.tenant.demoExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(user.policyAcceptances[0]).toMatchObject({ policyVersion: POLICY_VERSION, termsAccepted: true, privacyAccepted: true, marketingOptIn: false });
    expect((await prisma.signupRequest.findUniqueOrThrow({ where: { id: row.id } })).passwordHash).toBe('');
    const me = await ctx.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${v.body.accessToken}`);
    expect(me.body.tenant.slug).toMatch(/^signup-test-jewels-/);
    // password works for a normal login afterwards
    expect((await ctx.http().post('/api/v1/auth/login').send({ email: 'riya@example.com', password: 'Sup3rSecret!x' })).status).toBe(200);
    // the same code cannot be replayed
    expect((await verify(s.body.requestId, code)).body.error.code).toBe('REQUEST_INVALID');
  });

  it('mobile (SMS) OTP marks the phone as verified', async () => {
    const s = await start({ channel: 'SMS', email: 'sms@example.com', phone: '+971501234567', country: 'AE' });
    expect(s.body.sentTo).toMatch(/•+567$/);
    expect(ctx.otp.last()).toMatchObject({ channel: 'SMS', to: '+971501234567' });
    await verify(s.body.requestId, ctx.otp.last().code);
    const u = await prisma.user.findFirstOrThrow({ where: { email: 'sms@example.com' }, include: { tenant: true } });
    expect(u.phoneVerifiedAt).toBeTruthy();
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.tenant.currency).toBe('AED');
  });

  it('wrong codes are counted and the request locks after 5 attempts — even the right code is then refused', async () => {
    const s = await start();
    const good = ctx.otp.last().code;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await verify(s.body.requestId, wrong)).body.error.code).toBe('CODE_INVALID');
    expect((await verify(s.body.requestId, wrong)).body.error.code).toBe('CODE_INVALID');
    const locked = await verify(s.body.requestId, good);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await prisma.user.count({ where: { email: 'riya@example.com' } })).toBe(0);
  });

  it('expired codes are refused; resend has a cooldown, issues a new code and invalidates the old one', async () => {
    const s = await start();
    const first = ctx.otp.last().code;
    expect((await ctx.http().post('/api/v1/public/signup/resend').send({ requestId: s.body.requestId })).body.error.code).toBe('RESEND_COOLDOWN');
    await prisma.signupRequest.update({ where: { id: s.body.requestId }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    expect((await ctx.http().post('/api/v1/public/signup/resend').send({ requestId: s.body.requestId })).status).toBe(200);
    const second = ctx.otp.last().code;
    expect(ctx.otp.sent).toHaveLength(2);
    if (first !== second) expect((await verify(s.body.requestId, first)).body.error.code).toBe('CODE_INVALID');
    await prisma.signupRequest.update({ where: { id: s.body.requestId }, data: { otpExpiresAt: new Date(Date.now() - 1000), attempts: 0 } });
    expect((await verify(s.body.requestId, second)).body.error.code).toBe('CODE_EXPIRED');
  });

  it('rejects existing accounts, honours the honeypot, and rate-limits by e-mail', async () => {
    const w = await resetWorld();
    expect((await start({ email: `owner@test-a.test` })).body.error.code).toBe('ACCOUNT_EXISTS');
    expect((await start({ phone: '+919999999999', email: 'honeypot@example.com', website: 'http://spam' })).status).toBe(200);
    expect(ctx.otp.sent).toHaveLength(0);
    expect(await prisma.signupRequest.count({ where: { email: 'honeypot@example.com' } })).toBe(0);
    for (let i = 0; i < 3; i++) expect((await start({ email: 'limit@example.com', phone: `+91980000000${i}` })).status).toBe(200);
    expect((await start({ email: 'limit@example.com', phone: '+919800000009' })).status).toBe(429);
    void w;
  });

  it('delivery failure stores nothing and tells the user honestly', async () => {
    ctx.otp.failNext = true;
    const r = await start({ email: 'fail@example.com' });
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(await prisma.signupRequest.count({ where: { email: 'fail@example.com' } })).toBe(0);
  });

  it('privacy endpoints: status, export (owner only) and password-confirmed self-deletion of a demo workspace', async () => {
    const s = await start({ email: 'owner2@example.com', phone: '+919811111111' });
    const v = await verify(s.body.requestId, ctx.otp.last().code);
    const auth = { Authorization: `Bearer ${v.body.accessToken}` };
    const p = await ctx.http().get('/api/v1/account/privacy').set(auth);
    expect(p.body).toMatchObject({ acceptedVersion: POLICY_VERSION, isDemo: true, emailVerified: true, canDeleteWorkspace: true, retentionDays: 30 });
    const ex = await ctx.http().get('/api/v1/account/export').set(auth);
    expect(ex.status).toBe(200);
    expect(ex.headers['content-disposition']).toMatch(/attachment/);
    expect(JSON.parse(ex.text).users[0].email).toBe('owner2@example.com');
    expect(ex.text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);

    const wrongPw = await ctx.http().delete('/api/v1/account').set(auth).send({ password: 'wrong', confirm: 'DELETE MY WORKSPACE' });
    expect(wrongPw.status).toBe(401);
    expect((await ctx.http().delete('/api/v1/account').set(auth).send({ password: 'Sup3rSecret!x', confirm: 'yes' })).status).toBe(400);
    expect((await ctx.http().delete('/api/v1/account').set(auth).send({ password: 'Sup3rSecret!x', confirm: 'DELETE MY WORKSPACE' })).status).toBe(204);
    expect(await prisma.user.count({ where: { email: 'owner2@example.com' } })).toBe(0);
    expect((await ctx.http().get('/api/v1/auth/me').set(auth)).status).toBe(401);
  });

  it('non-demo (customer/seeded) workspaces cannot self-delete, and non-owners cannot export', async () => {
    const w = await resetWorld();
    const owner = await login(ctx.http, w.A.owner.email);
    const r = await ctx.http().delete('/api/v1/account').set(owner.auth).send({ password: 'Test@12345', confirm: 'DELETE MY WORKSPACE' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NOT_SELF_SERVICE');
    const sales = await login(ctx.http, w.A.sales.email);
    expect((await ctx.http().get('/api/v1/account/export').set(sales.auth)).status).toBe(403);
  });

  it('retention: expired demo workspaces (and stale signup requests) are purged, live ones are kept', async () => {
    const { purgeExpiredDemos, createStorage, loadEnv } = await import('@techmunda/core');
    const mk = (slug: string, days: number) => prisma.tenant.create({ data: { name: slug, slug, isDemo: true, demoExpiresAt: new Date(Date.now() + days * 86_400_000) } });
    const old = await mk('signup-old', -1);
    const live = await mk('signup-live', 5);
    const r = await purgeExpiredDemos(prisma, createStorage(loadEnv()));
    expect(r.tenantsDeleted).toBe(1);
    expect(await prisma.tenant.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.tenant.findUnique({ where: { id: live.id } })).not.toBeNull();
  });
});

describe('OTP delivery adapter safety', () => {
  const env = (o: Record<string, unknown>) => ({ NODE_ENV: 'development', ...o }) as any;
  it('exposes only configured channels', () => {
    expect(new ProviderOtpDelivery(env({})).channels()).toEqual([]);
    expect(new ProviderOtpDelivery(env({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' })).channels()).toEqual(['EMAIL']);
    expect(new ProviderOtpDelivery(env({ TWILIO_ACCOUNT_SID: 's', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+1' })).channels()).toEqual(['SMS']);
  });
  it('console OTP mode is refused in production and on hosted platforms', () => {
    expect(new ProviderOtpDelivery(env({ ALLOW_INSECURE_OTP_CONSOLE: true })).channels()).toEqual(['EMAIL', 'SMS']);
    expect(new ProviderOtpDelivery(env({ ALLOW_INSECURE_OTP_CONSOLE: true, NODE_ENV: 'production' })).channels()).toEqual([]);
    process.env.RENDER = 'true';
    try { expect(new ProviderOtpDelivery(env({ ALLOW_INSECURE_OTP_CONSOLE: true })).channels()).toEqual([]); } finally { delete process.env.RENDER; }
  });
});

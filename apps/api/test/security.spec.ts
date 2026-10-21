import { prisma } from '@techmunda/database';
import { MailError } from '../src/security/mail.service';
import { SecurityService } from '../src/security/security.service';
import { createApp, login, PASSWORD, resetWorld, webhookHeaders, type World } from './helpers';

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('security monitoring, alerts and e-mail readiness', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let w: World;
  beforeAll(async () => { ctx = await createApp(); });
  beforeEach(async () => { w = await resetWorld(); ctx.mail.reset(); ctx.bans.clear(); await prisma.securityEvent.deleteMany({}); });
  afterAll(async () => { await ctx.app.close(); await prisma.$disconnect(); });

  const badLogin = (ip: string, email = 'owner@test-a.test') => ctx.http().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: 'wrong-password' });
  const goodLogin = (ip: string) => ctx.http().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email: 'owner@test-a.test', password: PASSWORD });

  it('e-mails ONE alert (with the IP) after 5 failed logins, records events without raw IPs, and never leaks credentials', async () => {
    for (let i = 0; i < 4; i++) await badLogin('203.0.113.9');
    await wait();
    expect(ctx.mail.sent).toHaveLength(0);
    await badLogin('203.0.113.9');
    await wait(300);
    expect(ctx.mail.sent).toHaveLength(1);
    const m = ctx.mail.sent[0];
    expect(m.to).toBe('ops@alerts.test');
    expect(m.subject).toMatch(/\[Techmunda Security\] .*Repeated failed logins/);
    expect(m.text).toContain('203.0.113.9');
    expect(m.text).not.toMatch(/wrong-password|owner@test-a\.test/); // no password, no full e-mail
    await badLogin('203.0.113.9'); await wait(200);
    expect(ctx.mail.sent).toHaveLength(1); // deduplicated for 15 minutes
    const rows = await prisma.securityEvent.findMany({ where: { type: 'LOGIN_FAILED' } });
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
  });

  it('auto-blocks an IP once it crosses 15 failures in 10 minutes — even the CORRECT password is then refused — other IPs are unaffected', async () => {
    const security = ctx.app.get(SecurityService);
    const ip = '198.51.100.77';
    // the login route itself is throttled to 10/min, so a slow attacker accumulates failures across minutes: seed 14 earlier ones
    await prisma.securityEvent.createMany({ data: Array.from({ length: 14 }, () => ({ type: 'LOGIN_FAILED', severity: 'MEDIUM', ipHash: security.hashIp(ip) })) });
    expect((await goodLogin(ip)).status).toBe(200); // not blocked yet
    await badLogin(ip); // the 15th failure
    await wait(400);
    const blocked = await goodLogin(ip);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('BLOCKED');
    expect((await goodLogin('198.51.100.78')).status).toBe(200);
    expect(ctx.mail.sent.some((m) => /blocked for 1 hour/.test(m.text) && m.subject.includes('CRITICAL'))).toBe(true);
  });

  it('a replayed refresh token raises an immediate CRITICAL alert', async () => {
    const { refreshToken } = await login(ctx.http, w.A.owner.email);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken });
    const reuse = await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.body.error.code).toBe('TOKEN_REUSED');
    await wait(300);
    const alert = ctx.mail.sent.find((m) => /session theft/.test(m.subject));
    expect(alert).toBeDefined();
    expect(alert!.subject).toMatch(/CRITICAL/);
    expect(alert!.text).not.toContain(refreshToken);
  });

  it('forged tokens are recorded; expired ones are not treated as attacks', async () => {
    await ctx.http().get('/api/v1/leads').set('Authorization', 'Bearer aaa.bbb.ccc');
    await wait(200);
    expect(await prisma.securityEvent.count({ where: { type: 'FORGED_TOKEN' } })).toBe(1);
  });

  it('a bad webhook signature alerts immediately', async () => {
    const { raw, headers } = webhookHeaders(w.A.tenantId, { correlationId: 'corr-12345678' }, { badSig: true });
    expect((await ctx.http().post('/api/v1/automation/daily-report').set(headers).send(raw)).status).toBe(401);
    await wait(300);
    expect(ctx.mail.sent.some((m) => /Automation webhook called with a bad signature/.test(m.subject))).toBe(true);
  });

  it('scanner bursts (many 404/401) raise an alert', async () => {
    for (let i = 0; i < 62; i++) await ctx.http().get(`/api/v1/does-not-exist-${i}`).set('X-Forwarded-For', '192.0.2.50');
    await wait(500);
    expect(ctx.mail.sent.some((m) => /scanner or enumeration/.test(m.subject))).toBe(true);
  });

  it('works without SMTP: events are still stored, nothing throws, requests are unaffected', async () => {
    ctx.mail.configured = false;
    for (let i = 0; i < 6; i++) expect((await badLogin('203.0.113.21')).status).toBe(401);
    await wait(300);
    expect(ctx.mail.sent).toHaveLength(0);
    expect(await prisma.securityEvent.count({ where: { type: 'LOGIN_FAILED' } })).toBe(6);
  });

  describe('operator endpoints (platform admin only)', () => {
    const admin = async () => {
      const t = await prisma.tenant.upsert({ where: { slug: 'test-a' }, update: {}, create: { name: 'x', slug: 'test-a' } });
      const bcrypt = await import('bcryptjs');
      await prisma.user.upsert({ where: { tenantId_email: { tenantId: t.id, email: 'root@test-a.test' } }, update: {}, create: { tenantId: t.id, fullName: 'Root', email: 'root@test-a.test', passwordHash: await bcrypt.hash(PASSWORD, 4), role: 'PLATFORM_ADMIN' } });
      return (await login(ctx.http, 'root@test-a.test')).auth;
    };

    it('readiness reports what is set without exposing secret values', async () => {
      const a = await admin();
      const r = await ctx.http().get('/api/v1/ops/readiness?verify=true').set(a);
      expect(r.status).toBe(200);
      expect(r.body.smtp.login).toEqual({ ok: true });
      expect(r.body.signup.channels).toEqual(['EMAIL', 'SMS']);
      expect(r.body.alerts.alertEmail).toBe('o•••@alerts.test');
      expect(JSON.stringify(r.body)).not.toMatch(/SMTP_PASS|password|secret/i);
      ctx.mail.configured = false;
      const off = await ctx.http().get('/api/v1/ops/readiness').set(a);
      expect(off.body.smtp).toMatchObject({ configured: false, missing: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] });
      expect(off.body.warnings.join(' ')).toMatch(/SMTP is not configured/);
    });

    it('test-email sends through SMTP, and reports honest, secret-free failures', async () => {
      const a = await admin();
      const ok = await ctx.http().post('/api/v1/ops/test-email').set(a).send({});
      expect(ok.body).toEqual({ ok: true, sentTo: 'o•••@alerts.test' });
      expect(ctx.mail.sent[0].to).toBe('ops@alerts.test');
      ctx.mail.failWith = new MailError('SMTP login was rejected. For Gmail use a 16-character App Password', 'AUTH');
      const bad = await ctx.http().post('/api/v1/ops/test-email').set(a).send({ to: 'me@example.com' });
      expect(bad.status).toBe(502);
      expect(bad.body.error.message).toMatch(/App Password/);
      ctx.mail.failWith = null; ctx.mail.configured = false;
      expect((await ctx.http().post('/api/v1/ops/test-email').set(a).send({})).body.error.code).toBe('SMTP_NOT_CONFIGURED');
    });

    it('test-alert proves the alert path end to end', async () => {
      const a = await admin();
      expect((await ctx.http().post('/api/v1/ops/test-alert').set(a)).body.ok).toBe(true);
      await wait(300);
      expect(ctx.mail.sent.some((m) => /Test alert/.test(m.subject))).toBe(true);
    });

    it('lists security events for platform admins only', async () => {
      await badLogin('203.0.113.30');
      await wait(200);
      const a = await admin();
      expect((await ctx.http().get('/api/v1/ops/security-events').set(a)).body.data.length).toBeGreaterThan(0);
      const owner = (await login(ctx.http, w.A.owner.email)).auth;
      for (const [m, p] of [['get', '/api/v1/ops/security-events'], ['get', '/api/v1/ops/readiness'], ['post', '/api/v1/ops/test-email']] as const) {
        expect(((await (ctx.http() as any)[m](p).set(owner).send({})) as any).status).toBe(403);
      }
      expect((await ctx.http().get('/api/v1/ops/readiness')).status).toBe(401);
    });
  });
});

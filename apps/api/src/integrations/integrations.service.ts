import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import { decryptSecret, encryptSecret, isGoogleConfigured, isOpenAiConfigured, signPayload, verifyPayload } from '@techmunda/core';
import { AuditService } from '../audit/audit.service';
import { ENV, PRISMA, type AppEnv, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import type { GmailConnection, GmailCredentials } from './gmail.gateway';

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.compose'];

@Injectable()
export class IntegrationsService {
  /** nonce → expiry. Single-use OAuth state. (Use Redis if you run more than one API instance.) */
  private readonly usedStates = new Map<string, number>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(ENV) private readonly env: AppEnv, private readonly audit: AuditService) {}

  private oauth() {
    return new google.auth.OAuth2(this.env.GOOGLE_CLIENT_ID, this.env.GOOGLE_CLIENT_SECRET, this.env.GOOGLE_REDIRECT_URI);
  }

  async status(tenantId: string) {
    const conn = await this.prisma.integrationConnection.findFirst({ where: { tenantId, provider: 'google' }, orderBy: { updatedAt: 'desc' } });
    const desired = this.env.GMAIL_DESIRED_SENDER ?? null;
    return {
      google: {
        configured: isGoogleConfigured(this.env),
        connected: conn?.status === 'ACTIVE',
        status: conn?.status ?? 'DISCONNECTED',
        accountIdentifier: conn?.accountIdentifier ?? null,
        lastError: conn?.lastError ?? null,
        desiredSender: desired,
        connectedAccountMatchesDesiredSender: desired && conn ? conn.accountIdentifier.toLowerCase() === desired.toLowerCase() : null,
        scopes: GOOGLE_SCOPES,
        blockedReason: !isGoogleConfigured(this.env) ? 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Sending is blocked until an OAuth client is configured and a Google account is connected.' : null,
      },
      ai: { live: isOpenAiConfigured(this.env), mode: isOpenAiConfigured(this.env) ? 'LIVE' : 'SIMULATED' },
      storage: this.env.STORAGE_DRIVER,
      queueMode: this.env.QUEUE_MODE,
    };
  }

  connectUrl(user: AuthUser) {
    if (!isGoogleConfigured(this.env)) throw new ServiceUnavailableException({ code: 'GOOGLE_NOT_CONFIGURED', message: 'Google OAuth is not configured on this server (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).' });
    const nonce = randomBytes(16).toString('hex');
    const state = signPayload({ t: user.tenantId, u: user.id, n: nonce }, this.env.URL_SIGNING_SECRET, 600);
    const url = this.oauth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state, include_granted_scopes: false, login_hint: this.env.GMAIL_DESIRED_SENDER });
    return { url };
  }

  async handleCallback(code: string | undefined, state: string | undefined, error?: string) {
    const back = (q: string) => `${this.env.WEB_PUBLIC_URL}/settings?google=${q}`;
    if (error) return back('denied');
    if (!code || !state) return back('error');
    const s = verifyPayload<{ t: string; u: string; n: string }>(state, this.env.URL_SIGNING_SECRET);
    this.gcStates();
    if (!s || this.usedStates.has(s.n)) return back('invalid_state');
    this.usedStates.set(s.n, Date.now() + 600_000);
    const user = await this.prisma.user.findFirst({ where: { id: s.u, tenantId: s.t, status: 'ACTIVE', role: { in: ['TENANT_OWNER', 'PLATFORM_ADMIN'] } } });
    if (!user) return back('invalid_state');
    try {
      const client = this.oauth();
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) return back('no_refresh_token');
      client.setCredentials(tokens);
      const info = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
      const email = info.data.email?.toLowerCase();
      if (!email) return back('error');
      const creds: GmailCredentials = { refresh_token: tokens.refresh_token, access_token: tokens.access_token, expiry_date: tokens.expiry_date };
      const encrypted = encryptSecret(JSON.stringify(creds), this.env.ENCRYPTION_KEY);
      await this.prisma.integrationConnection.upsert({
        where: { tenantId_provider_accountIdentifier: { tenantId: s.t, provider: 'google', accountIdentifier: email } },
        create: { tenantId: s.t, provider: 'google', accountIdentifier: email, encryptedCredentialsReference: encrypted, scopes: GOOGLE_SCOPES.join(' '), status: 'ACTIVE' },
        update: { encryptedCredentialsReference: encrypted, scopes: GOOGLE_SCOPES.join(' '), status: 'ACTIVE', lastError: null },
      });
      await this.audit.audit({ tenantId: s.t, actorId: s.u, action: 'integration.google_connected', resourceType: 'integration', metadata: { account: email } });
      return back('connected');
    } catch {
      return back('error');
    }
  }

  private gcStates() {
    const now = Date.now();
    for (const [k, exp] of this.usedStates) if (exp < now) this.usedStates.delete(k);
  }

  async getActiveConnection(tenantId: string): Promise<{ conn: GmailConnection | null; state: 'NONE' | 'REVOKED' | 'ACTIVE' }> {
    const row = await this.prisma.integrationConnection.findFirst({ where: { tenantId, provider: 'google' }, orderBy: { updatedAt: 'desc' } });
    if (!row || row.status === 'DISCONNECTED') return { conn: null, state: 'NONE' };
    if (row.status !== 'ACTIVE') return { conn: null, state: 'REVOKED' };
    const credentials = JSON.parse(decryptSecret(row.encryptedCredentialsReference, this.env.ENCRYPTION_KEY)) as GmailCredentials;
    return { conn: { id: row.id, tenantId, accountIdentifier: row.accountIdentifier, credentials }, state: 'ACTIVE' };
  }

  async persistTokens(connectionId: string, tokens: Partial<GmailCredentials>) {
    const row = await this.prisma.integrationConnection.findUnique({ where: { id: connectionId } });
    if (!row) return;
    const current = JSON.parse(decryptSecret(row.encryptedCredentialsReference, this.env.ENCRYPTION_KEY)) as GmailCredentials;
    const merged = { ...current, ...Object.fromEntries(Object.entries(tokens).filter(([, v]) => v != null)) };
    await this.prisma.integrationConnection.update({ where: { id: connectionId }, data: { encryptedCredentialsReference: encryptSecret(JSON.stringify(merged), this.env.ENCRYPTION_KEY) } });
  }

  async markRevoked(tenantId: string, connectionId: string, message: string) {
    await this.prisma.integrationConnection.updateMany({ where: { id: connectionId, tenantId }, data: { status: 'REVOKED', lastError: message } });
    await this.audit.audit({ tenantId, action: 'integration.google_revoked', resourceType: 'integration', resourceId: connectionId });
  }

  async disconnect(user: AuthUser, revoke?: (c: GmailConnection) => Promise<void>) {
    const { conn } = await this.getActiveConnection(user.tenantId);
    if (conn && revoke) await revoke(conn).catch(() => undefined);
    await this.prisma.integrationConnection.updateMany({ where: { tenantId: user.tenantId, provider: 'google' }, data: { status: 'DISCONNECTED', encryptedCredentialsReference: encryptSecret('{}', this.env.ENCRYPTION_KEY) } });
    await this.audit.audit({ tenantId: user.tenantId, actorId: user.id, action: 'integration.google_disconnected', resourceType: 'integration' });
    return { disconnected: true };
  }

  assertOwner(user: AuthUser) {
    if (!['TENANT_OWNER', 'PLATFORM_ADMIN'].includes(user.role)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the tenant owner can manage integrations' });
  }
  /** Not used directly; kept to document the failure mode when state is malformed. */
  badState(): never {
    throw new BadRequestException({ code: 'INVALID_STATE', message: 'OAuth state invalid' });
  }
}

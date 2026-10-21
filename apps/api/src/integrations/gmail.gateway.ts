import { google } from 'googleapis';
import { scrubSecrets } from '@techmunda/core';

export type GmailErrorKind = 'AUTH_REVOKED' | 'RATE_LIMITED' | 'TRANSIENT' | 'FATAL';
export class GmailError extends Error {
  constructor(message: string, public readonly kind: GmailErrorKind) {
    super(message);
    this.name = 'GmailError';
  }
}

export interface GmailCredentials {
  refresh_token: string;
  access_token?: string | null;
  expiry_date?: number | null;
}
export interface GmailConnection {
  id: string;
  tenantId: string;
  accountIdentifier: string;
  credentials: GmailCredentials;
}

export interface GmailGateway {
  /** Create (or update, when existingDraftId is given) a Gmail draft from an RFC 2822 message. */
  upsertDraft(conn: GmailConnection, raw: string, existingDraftId?: string | null): Promise<{ draftId: string }>;
  /** Send an existing Gmail draft. The returned id is provider-confirmed. */
  sendDraft(conn: GmailConnection, draftId: string): Promise<{ messageId: string; threadId?: string | null }>;
  revoke?(conn: GmailConnection): Promise<void>;
}
export const GMAIL_GATEWAY = 'GMAIL_GATEWAY';

export function classifyGoogleError(err: unknown): GmailError {
  const e = err as { code?: number | string; status?: number; message?: string; response?: { status?: number; data?: { error?: string | { message?: string; errors?: Array<{ reason?: string }> } } } };
  const status = Number(e?.response?.status ?? e?.status ?? (typeof e?.code === 'number' ? e.code : 0));
  const dataErr = e?.response?.data?.error;
  const msg = scrubSecrets(typeof dataErr === 'string' ? dataErr : (dataErr as { message?: string })?.message ?? e?.message ?? 'Gmail request failed');
  const reason = typeof dataErr === 'object' ? dataErr?.errors?.[0]?.reason : undefined;
  if (/invalid_grant|invalid_token|unauthorized_client|Token has been expired or revoked/i.test(`${msg} ${typeof dataErr === 'string' ? dataErr : ''}`) || status === 401) return new GmailError('Google authorization expired or was revoked. Reconnect the Gmail account.', 'AUTH_REVOKED');
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') return new GmailError(`Gmail rate limit: ${msg}`, 'RATE_LIMITED');
  if (status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(e?.code))) return new GmailError(`Gmail temporarily unavailable: ${msg}`, 'TRANSIENT');
  if (status === 403 && /insufficient|scope/i.test(msg)) return new GmailError('Gmail permission missing. Reconnect and grant the requested access.', 'AUTH_REVOKED');
  return new GmailError(msg, 'FATAL');
}

/** Real Gmail API implementation. Never logs tokens; token refreshes are persisted via onTokens. */
export class GoogleGmailGateway implements GmailGateway {
  constructor(
    private readonly cfg: { clientId: string; clientSecret: string; redirectUri: string },
    private readonly onTokens: (connectionId: string, tokens: Partial<GmailCredentials>) => Promise<void>,
  ) {}

  private client(conn: GmailConnection) {
    const oauth = new google.auth.OAuth2(this.cfg.clientId, this.cfg.clientSecret, this.cfg.redirectUri);
    oauth.setCredentials({ refresh_token: conn.credentials.refresh_token, access_token: conn.credentials.access_token ?? undefined, expiry_date: conn.credentials.expiry_date ?? undefined });
    oauth.on('tokens', (t) => {
      void this.onTokens(conn.id, { access_token: t.access_token, expiry_date: t.expiry_date, ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}) });
    });
    return google.gmail({ version: 'v1', auth: oauth });
  }

  async upsertDraft(conn: GmailConnection, raw: string, existingDraftId?: string | null) {
    const gmail = this.client(conn);
    try {
      if (existingDraftId) {
        try {
          const r = await gmail.users.drafts.update({ userId: 'me', id: existingDraftId, requestBody: { id: existingDraftId, message: { raw } } });
          return { draftId: r.data.id ?? existingDraftId };
        } catch (e) {
          if (classifyGoogleError(e).kind !== 'FATAL') throw e; // draft deleted by user → create a new one below
        }
      }
      const r = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
      if (!r.data.id) throw new GmailError('Gmail did not return a draft id', 'FATAL');
      return { draftId: r.data.id };
    } catch (e) {
      throw e instanceof GmailError ? e : classifyGoogleError(e);
    }
  }

  async sendDraft(conn: GmailConnection, draftId: string) {
    const gmail = this.client(conn);
    try {
      const r = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
      if (!r.data.id) throw new GmailError('Gmail did not confirm the message id', 'FATAL');
      return { messageId: r.data.id, threadId: r.data.threadId };
    } catch (e) {
      throw e instanceof GmailError ? e : classifyGoogleError(e);
    }
  }

  async revoke(conn: GmailConnection) {
    const oauth = new google.auth.OAuth2(this.cfg.clientId, this.cfg.clientSecret, this.cfg.redirectUri);
    await oauth.revokeToken(conn.credentials.refresh_token).catch(() => undefined);
  }
}

/** Encodes a plain-text RFC 2822 message as base64url for the Gmail API. Rejects header injection. */
export function buildRawMessage(m: { from: string; to: string; subject: string; body: string }): string {
  for (const v of [m.from, m.to, m.subject]) if (/[\r\n]/.test(v)) throw new GmailError('Header values must not contain line breaks', 'FATAL');
  const subject = /^[\x20-\x7e]*$/.test(m.subject) ? m.subject : `=?UTF-8?B?${Buffer.from(m.subject, 'utf8').toString('base64')}?=`;
  const body = Buffer.from(m.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const msg = [`From: ${m.from}`, `To: ${m.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
  return Buffer.from(msg, 'utf8').toString('base64url');
}

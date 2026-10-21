/** Keys whose values must never reach logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-automation-signature"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.client_secret',
  '*.encryptedCredentialsReference',
  '*.body', // email bodies
  '*.apiKey',
];

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /ya29\.[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/g,
  /1\/\/[A-Za-z0-9_-]{20,}/g,
];

/** Scrub secret-looking substrings from free text (error messages from SDKs). */
export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, '[REDACTED]'), text);
}

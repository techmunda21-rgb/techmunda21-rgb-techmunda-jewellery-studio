// Prints the per-tenant automation secret to put in n8n as TENANT_WEBHOOK_SECRET.
// Usage: AUTOMATION_WEBHOOK_SECRET=... node tenant-webhook-secret.mjs <tenant-uuid>
// Optional: --call <path> sends a signed `{correlationId}` POST to API_BASE_URL (default http://localhost:4000/api/v1) to prove the signature works.
import { createHmac } from 'crypto';
const [tenantId, flag, path] = process.argv.slice(2);
const master = process.env.AUTOMATION_WEBHOOK_SECRET;
if (!master || !tenantId) { console.error('usage: AUTOMATION_WEBHOOK_SECRET=... node tenant-webhook-secret.mjs <tenant-id> [--call /automation/daily-report]'); process.exit(1); }
const secret = createHmac('sha256', master).update(`tenant:${tenantId}`).digest('hex');
if (flag !== '--call') { console.log(secret); process.exit(0); }
const body = JSON.stringify({ correlationId: `manual-${Date.now()}` });
const ts = String(Math.floor(Date.now() / 1000));
const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1'}${path}`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-automation-timestamp': ts, 'x-automation-signature': sig } });
console.log(res.status, await res.text());

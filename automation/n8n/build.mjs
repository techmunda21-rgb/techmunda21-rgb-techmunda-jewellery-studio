// Generates the importable n8n workflow JSON files in ./workflows. Run: node build.mjs
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('workflows', { recursive: true });
let id = 0;
const node = (name, type, typeVersion, position, parameters = {}, extra = {}) => ({ id: `n${++id}`, name, type, typeVersion, position, parameters, ...extra });
const conn = (pairs) => { const c = {}; for (const [from, to, out = 0] of pairs) { c[from] ??= { main: [] }; while (c[from].main.length <= out) c[from].main.push([]); c[from].main[out].push({ node: to, type: 'main', index: 0 }); } return c; };

/** Code node: HMAC-SHA256 of `${ts}.${body}` with the per-tenant secret (see docs/SECURITY.md). Secrets come from n8n env vars, never from the workflow file. */
const signCode = (path, bodyExpr) => `
const crypto = require('crypto');
const tenantId = $env.TENANT_ID;
const secret = $env.TENANT_WEBHOOK_SECRET;
if (!tenantId || !secret) throw new Error('TENANT_ID / TENANT_WEBHOOK_SECRET are not configured in n8n');
const body = JSON.stringify(${bodyExpr});
const ts = String(Math.floor(Date.now() / 1000));
const signature = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
return [{ json: { url: $env.API_BASE_URL + '${path}', body, headers: { 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-automation-timestamp': ts, 'x-automation-signature': signature } } }];`.trim();

const http = (name, position) => node(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
  method: 'POST', url: '={{ $json.url }}', sendHeaders: true, specifyHeaders: 'json', jsonHeaders: '={{ JSON.stringify($json.headers) }}',
  sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ $json.body }}', options: { timeout: 30000 },
}, { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueErrorOutput' });

const failed = (position) => node('Record failure (visible in n8n execution log)', 'n8n-nodes-base.noOp', 1, position, {}, { notes: 'No credentials or message bodies are logged. The API also records every run in automation_runs.' });

const inboundValidate = node('Validate signature', 'n8n-nodes-base.code', 2, [260, 300], {
  jsCode: `
const crypto = require('crypto');
const secret = $env.INBOUND_WEBHOOK_SECRET;
if (!secret) throw new Error('INBOUND_WEBHOOK_SECRET is not configured');
const raw = $input.first().json.rawBody ?? '';
const given = ($input.first().json.headers['x-signature'] || '').replace(/^sha256=/, '');
const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
const ok = given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
if (!ok) throw new Error('Invalid webhook signature');
return [{ json: { payload: $input.first().json.body } }];`.trim(),
});
const webhook = (name, path) => node(name, 'n8n-nodes-base.webhook', 2, [40, 300], { httpMethod: 'POST', path, responseMode: 'onReceived', options: { rawBody: true } }, { webhookId: `techmunda-${path}` });

const wf = (name, nodes, connections, extra = {}) => ({ name, nodes, connections, active: false, settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none', saveManualExecutions: false, ...extra }, tags: [{ name: 'techmunda' }], meta: { description: 'Tenant-aware. Uses n8n environment variables API_BASE_URL, TENANT_ID, TENANT_WEBHOOK_SECRET (and INBOUND_WEBHOOK_SECRET for inbound webhooks).' } });
const save = (file, w) => writeFileSync(`workflows/${file}`, JSON.stringify(w, null, 2) + '\n');

/* A — Lead capture */
id = 0;
{
  const n = [webhook('Lead webhook', 'techmunda-lead-capture'), inboundValidate,
    node('Validate payload', 'n8n-nodes-base.code', 2, [480, 300], { jsCode: `
const p = $input.first().json.payload || {};
const errors = [];
if (!p.name || String(p.name).trim().length < 2) errors.push('name');
if (!p.email && !p.phone) errors.push('email or phone');
if (p.consent !== true) errors.push('explicit consent (consent must be true)');
if (!p.tenantSlug) errors.push('tenantSlug');
if (errors.length) throw new Error('Invalid payload: ' + errors.join(', '));
const { name, email, phone, productInterest, budgetRange, preferredMaterial, purchaseTimeline, appointmentDate, message, consent, tenantSlug } = p;
const correlationId = p.correlationId || ('lead-' + (email || phone) + '-' + new Date().toISOString().slice(0, 10));
return [{ json: { lead: { tenantSlug, name, email, phone, productInterest, budgetRange, preferredMaterial, purchaseTimeline, appointmentDate, message, consent }, correlationId } }];`.trim() }),
    node('Sign request', 'n8n-nodes-base.code', 2, [700, 300], { jsCode: signCode('/automation/lead-capture', '{ correlationId: $json.correlationId, lead: $json.lead }') }),
    http('Create lead + queue AI qualification + notify sales user (API)', [920, 260]), failed([1180, 380])];
  save('A-lead-capture.json', wf('Techmunda · A · Lead capture', n, conn([['Lead webhook', 'Validate signature'], ['Validate signature', 'Validate payload'], ['Validate payload', 'Sign request'], ['Sign request', 'Create lead + queue AI qualification + notify sales user (API)'], ['Create lead + queue AI qualification + notify sales user (API)', 'Record failure (visible in n8n execution log)', 1]])));
}
/* B — Creative job */
id = 0;
{
  const n = [webhook('Creative job event', 'techmunda-creative-job'), inboundValidate,
    node('Validate payload', 'n8n-nodes-base.code', 2, [480, 300], { jsCode: `
const p = $input.first().json.payload || {};
if (!/^[0-9a-f-]{36}$/i.test(p.creativeJobId || '')) throw new Error('creativeJobId (uuid) is required');
return [{ json: { creativeJobId: p.creativeJobId, correlationId: p.correlationId || ('creative-' + p.creativeJobId) } }];`.trim() }),
    node('Sign request', 'n8n-nodes-base.code', 2, [700, 300], { jsCode: signCode("/automation/creative-jobs/' + $json.creativeJobId + '/process", '{ correlationId: $json.correlationId }') }),
    http('Fetch authorised source → provider adapter → store output → mark DRAFT for review (API)', [920, 260]), failed([1180, 380])];
  save('B-creative-job.json', wf('Techmunda · B · Creative job', n, conn([['Creative job event', 'Validate signature'], ['Validate signature', 'Validate payload'], ['Validate payload', 'Sign request'], ['Sign request', n[4].name], [n[4].name, n[5].name, 1]])));
}
/* C — Follow-up drafts */
id = 0;
{
  const n = [node('Every hour', 'n8n-nodes-base.scheduleTrigger', 1.2, [40, 300], { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }),
    node('Sign request', 'n8n-nodes-base.code', 2, [260, 300], { jsCode: signCode('/automation/followups/draft-due', "{ correlationId: 'followup-' + new Date().toISOString().slice(0, 13), limit: 10 }") }),
    http('Draft follow-ups for consented, due leads → PENDING_REVIEW + notify (API, never sends)', [480, 260]), failed([760, 380])];
  save('C-followup-draft.json', wf('Techmunda · C · Follow-up drafts (review only)', n, conn([['Every hour', 'Sign request'], ['Sign request', n[2].name], [n[2].name, n[3].name, 1]])));
}
/* D — Approved send (only with a human confirmation token) */
id = 0;
{
  const n = [webhook('Explicit send request', 'techmunda-approved-send'), inboundValidate,
    node('Validate payload', 'n8n-nodes-base.code', 2, [480, 300], { jsCode: `
const p = $input.first().json.payload || {};
if (!p.confirmationToken) throw new Error('A human send confirmation token is required. Workflows cannot send on their own.');
if (!p.draftId) throw new Error('draftId is required');
return [{ json: { confirmationToken: p.confirmationToken, correlationId: 'send-' + p.draftId + '-' + String(p.version || '') } }];`.trim() }),
    node('Sign request', 'n8n-nodes-base.code', 2, [700, 300], { jsCode: signCode('/automation/send-approved', '{ correlationId: $json.correlationId, confirmationToken: $json.confirmationToken }') }),
    http('Verify approval version + permission + consent → Gmail API → record result + CRM activity (API)', [920, 260]), failed([1180, 380])];
  save('D-approved-send.json', wf('Techmunda · D · Approved send (human-confirmed)', n, conn([['Explicit send request', 'Validate signature'], ['Validate signature', 'Validate payload'], ['Validate payload', 'Sign request'], ['Sign request', n[4].name], [n[4].name, n[5].name, 1]])));
}
/* E — Daily report */
id = 0;
{
  const n = [node('Every day 08:00', 'n8n-nodes-base.scheduleTrigger', 1.2, [40, 300], { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * *' }] } }),
    node('Sign request', 'n8n-nodes-base.code', 2, [260, 300], { jsCode: signCode('/automation/daily-report', "{ correlationId: 'daily-' + new Date().toISOString().slice(0, 10) }") }),
    http('Fetch tenant metrics → summarise → deliver to in-app notifications (API)', [480, 260]), failed([760, 380])];
  save('E-daily-report.json', wf('Techmunda · E · Daily sales report', n, conn([['Every day 08:00', 'Sign request'], ['Sign request', n[2].name], [n[2].name, n[3].name, 1]])));
}
console.log('workflows written');

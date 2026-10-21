'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, ShieldCheck, Trash2, Unplug, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/card';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage } from '@/lib/api';
import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { useRouter } from 'next/navigation';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useAiStatus, useIntegrationStatus, useTeam } from '@/hooks/queries';

const GOOGLE_MSG: Record<string, [string, 'info' | 'warn' | 'error']> = {
  connected: ['Google account connected.', 'info'], denied: ['Google access was declined. Nothing was connected.', 'warn'], invalid_state: ['The sign-in link expired or was already used. Please try again.', 'error'],
  no_refresh_token: ['Google did not return offline access. Remove the app from your Google account permissions and reconnect.', 'error'], error: ['Connecting to Google failed. Please try again.', 'error'],
};

function PrivacyPanel() {
  const toast = useToast();
  const router = useRouter();
  const { signOut } = useAuth();
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  const [phrase, setPhrase] = useState('');
  const q = useQuery({ queryKey: ['privacy'], queryFn: () => api<any>('/account/privacy') });
  const exp = useMutation({ mutationFn: () => downloadFile('/account/export', 'techmunda-workspace-export.json'), onSuccess: () => toast.success('Export downloaded.'), onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({
    mutationFn: () => api('/account', { method: 'DELETE', body: { password: pw, confirm: phrase } }),
    onSuccess: async () => { toast.success('Workspace deleted.'); await signOut(); router.replace('/login'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = q.data;
  return (
    <Panel>
      <PanelHeader title="Privacy & data" description="Your policies, verification status, data export and deletion." action={<ShieldCheck className="h-5 w-5 text-gold-deep" aria-hidden />} />
      <div className="space-y-4 p-5 text-sm">
        {q.isLoading || !p ? <Skeleton className="h-24" /> : (<>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="eyebrow !text-[10px]">Policies accepted</dt><dd className="mt-1 font-medium">{p.acceptedVersion ? `v${p.acceptedVersion} · ${dateTime(p.acceptedAt)}` : 'Workspace created by Techmunda'}{p.acceptedVersion && p.acceptedVersion !== p.policyVersionCurrent && <Pill tone="gold" className="ml-2">update available</Pill>}</dd></div>
            <div><dt className="eyebrow !text-[10px]">Verified</dt><dd className="mt-1 flex gap-1.5">{p.emailVerified && <Pill tone="green">E-mail</Pill>}{p.phoneVerified && <Pill tone="green">Mobile</Pill>}{!p.emailVerified && !p.phoneVerified && <span className="text-ink-muted">—</span>}</dd></div>
            <div><dt className="eyebrow !text-[10px]">Data retention</dt><dd className="mt-1 font-medium">{p.isDemo ? `Auto-deleted ${dateTime(p.demoExpiresAt)}` : 'Managed by Techmunda agreement'}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link href="/legal/terms" target="_blank"><FileText className="h-4 w-4" />Terms of Demo Use</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href="/legal/privacy" target="_blank"><FileText className="h-4 w-4" />Privacy Policy</Link></Button>
            <Button variant="gold" size="sm" loading={exp.isPending} onClick={() => exp.mutate()}><Download className="h-4 w-4" />Download my data</Button>
            {p.canDeleteWorkspace && <Button variant="danger" size="sm" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Delete workspace</Button>}
          </div>
          {!p.isDemo && <p className="text-xs text-ink-muted">To delete this workspace, e-mail techmunda21@gmail.com from the owner’s address.</p>}
        </>)}
      </div>
      <Dialog open={del} onOpenChange={setDel}>
        <DialogContent title="Delete this workspace?" description="This permanently deletes the workspace, every user, lead, product, image and PDF in it. It cannot be undone — download your data first.">
          <label className="mb-1 block text-[13px] font-medium" htmlFor="del-pw">Your password</label>
          <Input id="del-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <label className="mb-1 mt-3 block text-[13px] font-medium" htmlFor="del-phrase">Type <strong>DELETE MY WORKSPACE</strong> to confirm</label>
          <Input id="del-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
          <div className="mt-5 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button variant="danger" disabled={!pw || phrase !== 'DELETE MY WORKSPACE'} loading={remove.isPending} onClick={() => remove.mutate()}>Delete everything</Button></div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function PlatformPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const ready = useQuery({ queryKey: ['ops-readiness'], queryFn: () => api<any>('/ops/readiness', { query: { verify: 'true' } }), retry: false });
  const events = useQuery({ queryKey: ['ops-events'], queryFn: () => api<any>('/ops/security-events'), retry: false, refetchInterval: 60_000 });
  const testMail = useMutation({ mutationFn: () => api<any>('/ops/test-email', { method: 'POST', body: to ? { to } : {} }), onSuccess: (r) => { toast.success(`Test e-mail sent to ${r.sentTo}. Check the inbox.`); void qc.invalidateQueries({ queryKey: ['ops-readiness'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const testAlert = useMutation({ mutationFn: () => api<any>('/ops/test-alert', { method: 'POST' }), onSuccess: (r) => { toast.success(`Test security alert sent to ${r.sentTo}.`); void qc.invalidateQueries({ queryKey: ['ops-events'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const r = ready.data;
  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) => (
    <li className="flex items-start justify-between gap-3 px-5 py-3"><span>{label}{detail && <span className="block text-xs text-ink-muted">{detail}</span>}</span><Pill tone={ok ? 'green' : 'red'}>{ok ? 'Ready' : 'Not ready'}</Pill></li>
  );
  return (
    <>
      <Panel>
        <PanelHeader title="Email & OTP readiness" description="Platform admin only — shows whether verification codes and security alerts can be delivered. Secret values are never displayed." />
        {ready.isLoading ? <div className="p-5"><Skeleton className="h-28" /></div> : ready.isError ? <div className="p-5"><QueryError error={ready.error} /></div> : (<>
          <ul className="divide-y divide-gold/20 text-sm">
            <Row ok={r.smtp.configured && r.smtp.login?.ok !== false} label="E-mail (SMTP)" detail={r.smtp.configured ? `${r.smtp.host}:${r.smtp.port} as ${r.smtp.user}${r.smtp.login?.ok === false ? ` — ${r.smtp.login.error}` : r.smtp.login?.ok ? ' — login verified' : ''}` : `Missing: ${r.smtp.missing.join(', ')}`} />
            <Row ok={r.sms.configured} label="Mobile SMS (Twilio)" detail={r.sms.configured ? 'Configured' : `Missing: ${r.sms.missing.join(', ')}`} />
            <Row ok={r.signup.enabled} label="Signup with OTP" detail={r.signup.enabled ? `Verification channels: ${r.signup.channels.join(' + ')}` : 'Signup page shows “unavailable” until a channel is ready'} />
            <Row ok={r.alerts.canEmail} label="Security alert e-mails" detail={r.alerts.alertEmail ? `Alerts go to ${r.alerts.alertEmail}` : 'ALERT_EMAIL is not set'} />
          </ul>
          {r.warnings.length > 0 && <div className="space-y-2 px-5 pb-1 pt-4">{r.warnings.map((w: string) => <Banner key={w} tone="warn">{w}</Banner>)}</div>}
          <div className="flex flex-wrap items-end gap-3 border-t border-gold/25 p-5">
            <div className="min-w-[220px] flex-1"><label htmlFor="test-to" className="mb-1 block text-xs font-semibold text-ink-muted">Send a test e-mail to (default: alert address)</label><Input id="test-to" type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button variant="gold" size="sm" loading={testMail.isPending} onClick={() => testMail.mutate()}>Send test e-mail</Button>
            <Button variant="outline" size="sm" loading={testAlert.isPending} onClick={() => testAlert.mutate()}>Send test security alert</Button>
          </div>
        </>)}
      </Panel>
      <Panel>
        <PanelHeader title="Security events" description={`Failed logins, token replays, forged tokens, webhook failures, scanners. Currently blocked IPs: ${events.data?.blockedIps ?? 0}`} action={<ShieldCheck className="h-5 w-5 text-gold-deep" aria-hidden />} />
        {events.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : !events.data?.data.length ? <p className="p-5 text-sm text-ink-muted">No security events recorded.</p> : (
          <ul className="max-h-80 divide-y divide-gold/20 overflow-y-auto text-sm scroll-thin">{events.data.data.slice(0, 40).map((e: any) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span><Pill tone={e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'red' : e.severity === 'MEDIUM' ? 'gold' : 'muted'}>{e.severity}</Pill><code className="ml-2 text-xs">{e.type}</code>{e.alerted && <span className="ml-2 text-[11px] text-status-approved">e-mailed</span>}</span><span className="text-xs text-ink-muted">{dateTime(e.createdAt)}</span></li>
          ))}</ul>
        )}
      </Panel>
    </>
  );
}

function Settings() {
  const { me, can } = useAuth();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useIntegrationStatus();
  const ai = useAiStatus();
  const team = useTeam();
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api<any>('/audit', { query: { pageSize: 12 } }), enabled: can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER'), retry: false });
  const flag = sp.get('google');
  useEffect(() => { if (flag) void qc.invalidateQueries({ queryKey: ['integrations-status'] }); }, [flag, qc]);
  const connect = useMutation({ mutationFn: () => api<{ url: string }>('/integrations/google/connect'), onSuccess: (r) => { window.location.href = r.url; }, onError: (e) => toast.error(errorMessage(e)) });
  const disconnect = useMutation({ mutationFn: () => api('/integrations/google', { method: 'DELETE' }), onSuccess: () => { toast.success('Google account disconnected.'); void qc.invalidateQueries({ queryKey: ['integrations-status'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const g = status.data?.google;
  const owner = can('PLATFORM_ADMIN', 'TENANT_OWNER');

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Workspace, team and integrations." />
      {flag && GOOGLE_MSG[flag] && <Banner tone={GOOGLE_MSG[flag][1]}>{GOOGLE_MSG[flag][0]}</Banner>}

      <Panel>
        <PanelHeader title="Gmail integration" description="Required for creating Gmail drafts and sending approved emails." action={g && <Pill tone={g.connected ? 'green' : g.status === 'REVOKED' ? 'red' : 'muted'}>{g.connected ? 'Connected' : g.status === 'REVOKED' ? 'Revoked — reconnect' : 'Not connected'}</Pill>} />
        <div className="space-y-4 p-5">
          {status.isError ? <QueryError error={status.error} /> : status.isLoading ? <Skeleton className="h-24" /> : (<>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="eyebrow !text-[10px]">Connected account</dt><dd className="mt-1 font-medium">{g.accountIdentifier ?? '—'}</dd></div>
              <div><dt className="eyebrow !text-[10px]">Intended sender</dt><dd className="mt-1 font-medium">{g.desiredSender ?? 'Not set'}{g.connectedAccountMatchesDesiredSender === false && <Pill tone="gold" className="ml-2">differs</Pill>}</dd></div>
              <div><dt className="eyebrow !text-[10px]">Permission requested</dt><dd className="mt-1 font-medium">Gmail drafts &amp; send only (gmail.compose)</dd></div>
            </dl>
            {!g.configured && <Banner tone="warn" title="Google OAuth is not configured on this server">{g.blockedReason} The intended sender is only a preference — a real sign-in with that Google account is required.</Banner>}
            {g.status === 'REVOKED' && <Banner tone="error" title="Google access was revoked or expired">{g.lastError} Reconnect to resume sending.</Banner>}
            <div className="flex flex-wrap gap-2">
              {owner ? (<>
                <Button onClick={() => connect.mutate()} loading={connect.isPending} disabled={!g.configured}><Link2 className="h-4 w-4" />{g.connected ? 'Reconnect Google' : 'Connect Google account'}</Button>
                {g.connected && <Button variant="danger" onClick={() => confirm('Disconnect Gmail and revoke access?') && disconnect.mutate()} loading={disconnect.isPending}><Unplug className="h-4 w-4" />Disconnect</Button>}
              </>) : <p className="text-sm text-ink-muted">Only the workspace owner can connect Gmail.</p>}
            </div>
          </>)}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="AI &amp; automation status" description="What runs live and what is a labelled simulation." />
          <ul className="divide-y divide-gold/20 text-sm">
            {[['Text AI (qualification, drafts)', ai.data?.text], ['Image AI (creative studio)', ai.data?.image]].map(([k, v]: any) => (
              <li key={k} className="flex items-center justify-between gap-3 px-5 py-3"><span>{k}<span className="block text-xs text-ink-muted">{v?.provider}{v?.model ? ` · ${v.model}` : ''}</span></span><Pill tone={v?.mode === 'LIVE' ? 'green' : 'gold'}>{v?.mode === 'LIVE' ? 'Live' : 'Demo simulation'}</Pill></li>
            ))}
            <li className="flex items-center justify-between gap-3 px-5 py-3"><span>Storage<span className="block text-xs text-ink-muted">Uploads &amp; generated assets</span></span><Pill tone="muted">{ai.data?.storage ?? '…'}</Pill></li>
            <li className="flex items-center justify-between gap-3 px-5 py-3"><span>Job queue<span className="block text-xs text-ink-muted">Qualification &amp; creative jobs</span></span><Pill tone="muted">{ai.data?.queue ?? '…'}</Pill></li>
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Workspace" />
          <dl className="space-y-3 p-5 text-sm"><div className="flex justify-between"><dt className="text-ink-muted">Business</dt><dd className="font-medium">{me?.tenant.name}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">Country / currency</dt><dd className="font-medium">{me?.tenant.country} · {me?.tenant.currency}</dd></div><div className="flex justify-between"><dt className="text-ink-muted">Time zone</dt><dd className="font-medium">{me?.tenant.timezone}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Public enquiry page</dt><dd><a className="font-medium text-royal hover:underline" href={`/enquiry/${me?.tenant.slug}`} target="_blank" rel="noopener">/enquiry/{me?.tenant.slug}</a></dd></div></dl>
        </Panel>
      </div>

      {can('PLATFORM_ADMIN') && <PlatformPanel />}

      <PrivacyPanel />

      <Panel>
        <PanelHeader title="Team" description="Role-based access control" action={<Users className="h-5 w-5 text-gold-deep" aria-hidden />} />
        <ul className="divide-y divide-gold/20">{team.data?.data.map((u) => <li key={u.id} className="flex items-center gap-3 px-5 py-3"><Avatar name={u.fullName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{u.fullName}</p><p className="truncate text-xs text-ink-muted">{u.email}</p></div><Pill tone="gold">{ROLE_LABEL[u.role]}</Pill></li>)}</ul>
      </Panel>

      {audit.data && (
        <Panel>
          <PanelHeader title="Audit log" description="Security-relevant actions in this workspace" action={<ShieldCheck className="h-5 w-5 text-gold-deep" aria-hidden />} />
          <ul className="divide-y divide-gold/20 text-sm">{audit.data.data.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span><code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">{a.action}</code><span className="ml-2 text-xs text-ink-muted">{a.resourceType}</span></span><span className="text-xs text-ink-muted">{dateTime(a.createdAt)}</span></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Settings /></Suspense>;
}

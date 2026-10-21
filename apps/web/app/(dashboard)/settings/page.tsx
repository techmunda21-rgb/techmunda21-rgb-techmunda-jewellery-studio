'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, ShieldCheck, Unplug, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/card';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useAiStatus, useIntegrationStatus, useTeam } from '@/hooks/queries';

const GOOGLE_MSG: Record<string, [string, 'info' | 'warn' | 'error']> = {
  connected: ['Google account connected.', 'info'], denied: ['Google access was declined. Nothing was connected.', 'warn'], invalid_state: ['The sign-in link expired or was already used. Please try again.', 'error'],
  no_refresh_token: ['Google did not return offline access. Remove the app from your Google account permissions and reconnect.', 'error'], error: ['Connecting to Google failed. Please try again.', 'error'],
};

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

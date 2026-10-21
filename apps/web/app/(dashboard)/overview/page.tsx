'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, CalendarCheck, CheckSquare, ClipboardList, IndianRupee, Sparkles, TrendingUp, Users, Wallet } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/card';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { budgetRange, money, moneyCompact, timeAgo } from '@/lib/format';
import { useAiStatus } from '@/hooks/queries';
import { LEAD_STAGE_LABELS } from '@techmunda/shared';
import { cn } from '@/lib/utils';

const gold = 'rgb(var(--gold))';
const royal = 'rgb(var(--royal))';
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold"><Icon className="h-3.5 w-3.5" aria-hidden />{Math.abs(pct)}% vs prior period</span>;
}

function Kpi({ label, value, icon: Icon, delta, highlight, note }: { label: string; value: string; icon: any; delta?: number; highlight?: boolean; note?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border p-5 shadow-card', highlight ? 'border-gold/70 bg-royal text-royal-foreground' : 'border-gold/35 bg-ivory')}>
      <div className="flex items-start justify-between">
        <p className={cn('font-display text-4xl font-semibold leading-none', highlight && 'text-ivory')}>{value}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', highlight ? 'border-gold/70 text-gold' : 'border-gold/50 bg-gold/10 text-gold-deep')}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      </div>
      <p className={cn('mt-2 text-sm font-medium', highlight ? 'text-ivory/90' : 'text-ink')}>{label}</p>
      <p className={cn('mt-1', highlight ? 'text-gold-soft' : delta != null && delta < 0 ? 'text-status-rejected' : 'text-status-approved')}>
        {delta != null ? <Delta pct={delta} /> : <span className="text-xs text-ink-muted">{note}</span>}
      </p>
    </div>
  );
}

export default function OverviewPage() {
  const { me } = useAuth();
  const ov = useQuery({ queryKey: ['analytics', 'overview'], queryFn: () => api<any>('/analytics/overview', { query: { days: 30 } }) });
  const recent = useQuery({ queryKey: ['leads', 'recent'], queryFn: () => api<any>('/leads', { query: { pageSize: 6 } }) });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api<any>('/tasks') });
  const approvals = useQuery({ queryKey: ['approvals', 'PENDING_REVIEW'], queryFn: () => api<any>('/approvals') });
  const ai = useAiStatus();
  const cur = me?.tenant.currency ?? 'INR';

  if (ov.isError) return <QueryError error={ov.error} retry={() => ov.refetch()} />;
  const k = ov.data?.kpis;
  const funnel = (ov.data?.funnel ?? []).map((f: any) => ({ name: LEAD_STAGE_LABELS[f.stage as keyof typeof LEAD_STAGE_LABELS], short: LEAD_STAGE_LABELS[f.stage as keyof typeof LEAD_STAGE_LABELS].split(' ')[0], count: f.count, stage: f.stage }));
  const wonRevenue = ov.data?.revenue ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{greeting()}, {me?.user.fullName.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-ink-muted">Here’s what’s happening with your jewellery business · last 30 days</p>
        </div>
        {ai.data && <Pill tone={ai.data.text.mode === 'LIVE' ? 'green' : 'gold'}><Sparkles className="h-3 w-3" />AI: {ai.data.text.mode === 'LIVE' ? 'Live provider' : 'Demo simulation'}</Pill>}
      </div>

      {(approvals.data?.data?.length ?? 0) > 0 && (
        <Banner tone="info" title={`${approvals.data.data.length} item${approvals.data.data.length > 1 ? 's' : ''} awaiting your review`}>
          <Link href="/approvals" className="font-semibold text-royal underline underline-offset-2">Open the approval queue</Link> — nothing is published or sent until a person approves it.
        </Banner>
      )}

      {ov.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total Leads" value={String(k.totalLeads.value)} icon={Users} delta={k.totalLeads.deltaPct} />
            <Kpi label="Qualified Leads" value={String(k.qualifiedLeads.value)} icon={CheckSquare} delta={k.qualifiedLeads.deltaPct} />
            <Kpi label="Appointments" value={String(k.appointments.value)} icon={CalendarCheck} delta={k.appointments.deltaPct} />
            <Kpi label="Pipeline Value" value={moneyCompact(k.pipelineValue.value, cur)} icon={IndianRupee} delta={k.pipelineValue.deltaPct} highlight />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="New leads to qualify" value={String(k.newLeads.value)} icon={Sparkles} note="Awaiting first response" />
            <Kpi label="Pending follow-ups" value={String(k.pendingFollowUps.value)} icon={ClipboardList} note="Due now or overdue" />
            <Kpi label="Won revenue" value={moneyCompact(k.wonRevenue.value, cur)} icon={Wallet} note={`${k.wonRevenue.count} deals won`} />
            <Kpi label="Outstanding proposals" value={moneyCompact(k.outstandingProposals.value, cur)} icon={TrendingUp} note={`${k.outstandingProposals.count} open proposals`} />
          </div>
        </>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader title="Lead Pipeline" description="Leads by current stage" />
          <div className="h-72 p-4" role="img" aria-label="Bar chart of leads by pipeline stage">
            {ov.isLoading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gold} strokeOpacity={0.2} />
                  <XAxis dataKey="short" tickLine={false} axisLine={{ stroke: gold, strokeOpacity: 0.4 }} tick={{ fontSize: 12, fill: 'rgb(var(--ink-muted))' }} interval={0} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'rgb(var(--ink-muted))' }} />
                  <Tooltip cursor={{ fill: gold, fillOpacity: 0.1 }} contentStyle={{ background: 'rgb(var(--ivory))', border: `1px solid ${gold}`, borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [v, 'Leads']} labelFormatter={(_, p) => p?.[0]?.payload?.name} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {funnel.map((f: any, i: number) => <Cell key={i} fill={f.stage === 'WON' ? 'rgb(var(--status-approved))' : f.stage === 'LOST' ? 'rgb(var(--ink-muted))' : i % 2 ? gold : royal} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
        <Panel className="xl:col-span-2">
          <PanelHeader title="Revenue Overview" description="Won revenue by month" action={k && <span className="font-display text-xl font-semibold text-royal">{moneyCompact(k.wonRevenue.value, cur)}</span>} />
          <div className="h-72 p-4" role="img" aria-label="Area chart of won revenue by month">
            {ov.isLoading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={wonRevenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={royal} stopOpacity={0.35} /><stop offset="100%" stopColor={royal} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke={gold} strokeOpacity={0.2} />
                  <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: gold, strokeOpacity: 0.4 }} tick={{ fontSize: 12, fill: 'rgb(var(--ink-muted))' }} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => moneyCompact(v, cur).replace(/^[^\d]+/, '')} tick={{ fontSize: 12, fill: 'rgb(var(--ink-muted))' }} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--ivory))', border: `1px solid ${gold}`, borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [money(v, cur), 'Won revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke={royal} strokeWidth={2.5} fill="url(#rev)" dot={{ r: 3, fill: gold, stroke: royal }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader title="Recent Enquiries" action={<Link href="/leads" className="text-sm font-semibold text-royal hover:underline">View all</Link>} />
          {recent.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
            <ul className="divide-y divide-gold/20">
              {recent.data?.data.map((l: any) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gold/10">
                    {l.productImageUrl ? <img src={l.productImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-gold/50 object-cover" /> : <Avatar name={l.contact.name} className="h-10 w-10" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.contact.name}</p>
                      <p className="truncate text-xs text-ink-muted">{l.productInterest ?? 'General enquiry'} · {budgetRange(l.budgetMin, l.budgetMax, cur)}</p>
                    </div>
                    <div className="text-right">
                      <Pill tone={l.status === 'NEW' ? 'blue' : l.status === 'WON' ? 'green' : l.status === 'LOST' ? 'muted' : 'gold'}>{LEAD_STAGE_LABELS[l.status as keyof typeof LEAD_STAGE_LABELS]}</Pill>
                      <p className="mt-1 text-[11px] text-ink-muted">{timeAgo(l.createdAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {!recent.data?.data.length && <li className="px-5 py-10 text-center text-sm text-ink-muted">No enquiries yet. Share your enquiry page to start capturing leads.</li>}
            </ul>
          )}
        </Panel>
        <Panel className="xl:col-span-2">
          <PanelHeader title="Follow-ups due" description="Tasks and reminders" action={<Link href="/crm" className="text-sm font-semibold text-royal hover:underline">Open CRM</Link>} />
          <ul className="divide-y divide-gold/20">
            {tasks.data?.data.slice(0, 5).map((t: any) => (
              <li key={t.id}><Link href={`/leads/${t.leadId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gold/10">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{t.title}</p><p className="truncate text-xs text-ink-muted">{t.leadName}</p></div>
                <Pill tone={t.overdue ? 'red' : 'gold'}>{t.dueAt ? (t.overdue ? 'Overdue' : timeAgo(t.dueAt).replace(' ago', '')) : 'No date'}</Pill>
              </Link></li>
            ))}
            {!tasks.data?.data.length && <li className="px-5 py-10 text-center text-sm text-ink-muted">No open tasks.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

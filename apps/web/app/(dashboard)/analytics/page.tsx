'use client';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LEAD_STAGE_LABELS } from '@techmunda/shared';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/card';
import { Banner, QueryError } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { moneyCompact } from '@/lib/format';

const gold = 'rgb(var(--gold))';
const royal = 'rgb(var(--royal))';
const tip = { background: 'rgb(var(--ivory))', border: `1px solid ${gold}`, borderRadius: 10, fontSize: 12 };
const tick = { fontSize: 12, fill: 'rgb(var(--ink-muted))' };
const PIE = ['rgb(var(--royal))', 'rgb(var(--gold))', 'rgb(var(--maroon))', 'rgb(var(--status-approved))', 'rgb(var(--status-sent))'];

function ChartCard({ title, desc, children, h = 'h-64' }: { title: string; desc?: string; children: React.ReactNode; h?: string }) {
  return <Panel><PanelHeader title={title} description={desc} /><div className={`${h} p-4`}>{children}</div></Panel>;
}

export default function AnalyticsPage() {
  const { me } = useAuth();
  const cur = me?.tenant.currency ?? 'INR';
  const leads = useQuery({ queryKey: ['analytics', 'leads'], queryFn: () => api<any>('/analytics/leads') });
  const overview = useQuery({ queryKey: ['analytics', 'overview'], queryFn: () => api<any>('/analytics/overview', { query: { days: 30 } }) });
  const camp = useQuery({ queryKey: ['analytics', 'campaigns'], queryFn: () => api<any>('/analytics/campaigns') });
  if (leads.isError) return <QueryError error={leads.error} retry={() => leads.refetch()} />;
  const L = leads.data;
  const funnel = (overview.data?.funnel ?? []).map((f: any) => ({ name: LEAD_STAGE_LABELS[f.stage as keyof typeof LEAD_STAGE_LABELS], count: f.count }));

  return (
    <div>
      <PageHeader title="Analytics" description="Lead flow, conversion, content production and follow-up activity." />
      {leads.isLoading ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[['Win rate', `${L.conversion.winRatePct}%`, `${L.conversion.won} of ${L.conversion.total} leads`], ['Won revenue', moneyCompact(overview.data?.kpis.wonRevenue.value, cur), `${overview.data?.kpis.wonRevenue.count ?? 0} deals`], ['Open pipeline', moneyCompact(overview.data?.kpis.pipelineValue.value, cur), `${overview.data?.kpis.pipelineValue.count ?? 0} opportunities`]].map(([k, v, n]) => (
              <Panel key={k} className="p-5"><p className="eyebrow">{k}</p><p className="mt-2 font-display text-3xl font-semibold text-royal">{v}</p><p className="text-xs text-ink-muted">{n}</p></Panel>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="New leads per day" desc="Last 14 days"><ResponsiveContainer width="100%" height="100%"><LineChart data={L.daily} margin={{ left: -20, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={gold} strokeOpacity={0.2} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={tick} tickLine={false} axisLine={{ stroke: gold, strokeOpacity: 0.4 }} /><YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} /><Tooltip contentStyle={tip} /><Line type="monotone" dataKey="count" name="Leads" stroke={royal} strokeWidth={2.5} dot={{ r: 3, fill: gold, stroke: royal }} /></LineChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Pipeline funnel" desc="Leads by stage"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnel} layout="vertical" margin={{ left: 24, right: 12, top: 4 }}><CartesianGrid horizontal={false} stroke={gold} strokeOpacity={0.2} /><XAxis type="number" allowDecimals={false} tick={tick} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={118} tick={tick} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: gold, fillOpacity: 0.1 }} contentStyle={tip} /><Bar dataKey="count" name="Leads" fill={royal} radius={[0, 6, 6, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Lead sources"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={L.bySource} dataKey="count" nameKey="source" innerRadius={52} outerRadius={84} paddingAngle={2} label={(p) => String(p.name).replace(/_/g, ' ')}>{L.bySource.map((_: any, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} stroke="rgb(var(--ivory))" />)}</Pie><Tooltip contentStyle={tip} /></PieChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Lead score distribution" desc="Prioritisation heuristic, not a purchase probability"><ResponsiveContainer width="100%" height="100%"><BarChart data={L.scoreDistribution} margin={{ left: -20, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={gold} strokeOpacity={0.2} /><XAxis dataKey="band" tick={tick} tickLine={false} axisLine={{ stroke: gold, strokeOpacity: 0.4 }} /><YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: gold, fillOpacity: 0.1 }} contentStyle={tip} /><Bar dataKey="count" name="Leads" fill={gold} radius={[6, 6, 0, 0]} maxBarSize={56} /></BarChart></ResponsiveContainer></ChartCard>
          </div>
          <Panel>
            <PanelHeader title="Campaigns & content production" />
            <div className="space-y-4 p-5">
              {camp.isLoading ? <Skeleton className="h-24" /> : (<>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><p className="eyebrow mb-2 !text-[10px]">Creative assets by review status</p><div className="flex flex-wrap gap-2">{camp.data.contentProduction.map((c: any) => <Pill key={c.status} tone={c.status === 'APPROVED' ? 'green' : c.status === 'REJECTED' ? 'red' : 'gold'}>{c.status.replace('_', ' ').toLowerCase()}: {c.count}</Pill>)}{!camp.data.contentProduction.length && <span className="text-sm text-ink-muted">None yet</span>}</div></div>
                  <div><p className="eyebrow mb-2 !text-[10px]">Email drafts by status</p><div className="flex flex-wrap gap-2">{camp.data.communications.map((c: any) => <Pill key={c.status} tone={c.status === 'SENT' ? 'blue' : c.status === 'APPROVED' ? 'green' : c.status === 'REJECTED' || c.status === 'SEND_FAILED' ? 'red' : 'gold'}>{c.status.replace('_', ' ').toLowerCase()}: {c.count}</Pill>)}{!camp.data.communications.length && <span className="text-sm text-ink-muted">None yet</span>}</div></div>
                </div>
                <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{['Campaign', 'Type', 'Status', 'Assets'].map((h) => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-gold/20">{camp.data.campaigns.map((c: any) => <tr key={c.id}><td className="py-2.5 pr-4 font-medium">{c.name}</td><td className="pr-4">{c.type}</td><td className="pr-4">{c.status}</td><td>{c.assetCount}</td></tr>)}</tbody></table></div>
                <Banner>{camp.data.note}</Banner>
              </>)}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

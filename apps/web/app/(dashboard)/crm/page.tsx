'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, GripVertical, Mail, Plus, Search, Sparkles, X } from 'lucide-react';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@techmunda/shared';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreChip } from '@/components/features/lead-ui';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_SALES, useAuth } from '@/lib/auth';
import { budgetRange, moneyCompact, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTeam } from '@/hooks/queries';

const HEAD: Record<string, string> = {
  NEW: 'bg-maroon text-maroon-foreground', QUALIFIED: 'bg-stage-qualified text-ivory', CONTACTED: 'bg-gold-deep text-ivory', APPOINTMENT: 'bg-stage-demo text-ink',
  PROPOSAL: 'bg-royal text-royal-foreground', NEGOTIATION: 'bg-maroon-deep text-maroon-foreground', WON: 'bg-status-approved text-ivory', LOST: 'bg-ink-muted text-ivory',
};

export default function CrmPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { can, me } = useAuth();
  const team = useTeam();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [ideas, setIdeas] = useState<{ suggestions: string[]; source: string } | null>(null);
  const board = useQuery({ queryKey: ['board', q], queryFn: () => api<any>('/leads/board', { query: { q } }) });
  const cur = me?.tenant.currency ?? 'INR';
  const sales = can(...CAN_SALES);

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/leads/${id}`, { method: 'PATCH', body: { status } }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['board'] });
      const prev = qc.getQueriesData<any>({ queryKey: ['board'] });
      qc.setQueriesData<any>({ queryKey: ['board'] }, (old: any) => {
        if (!old) return old;
        let moved: any;
        const stages = old.stages.map((s: any) => { const f = s.leads.find((l: any) => l.id === id); if (f) moved = { ...f, status }; return { ...s, leads: s.leads.filter((l: any) => l.id !== id) }; });
        return { stages: stages.map((s: any) => (s.stage === status && moved ? { ...s, leads: [moved, ...s.leads] } : s)) };
      });
      return { prev };
    },
    onError: (e, _v, ctx) => { ctx?.prev.forEach(([k, d]) => qc.setQueryData(k, d)); toast.error(errorMessage(e)); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['board'] }); void qc.invalidateQueries({ queryKey: ['analytics'] }); },
  });
  const suggest = useMutation({ mutationFn: (id: string) => api<any>(`/leads/${id}/suggest-reply`, { method: 'POST', body: { tone: 'warm' } }), onSuccess: setIdeas, onError: (e) => toast.error(errorMessage(e)) });
  const draft = useMutation({ mutationFn: (id: string) => api<any>('/communications/drafts', { method: 'POST', body: { leadId: id, generate: true } }), onSuccess: (d) => { toast.success('Draft queued for review — nothing was sent.'); router.push(`/approvals?draft=${d.id}`); }, onError: (e) => toast.error(errorMessage(e)) });

  const stages: any[] = board.data?.stages ?? [];
  const filterLead = (l: any) => !owner || (owner === 'me' ? l.assignedTo === me?.user.id : l.assignedTo === owner);

  return (
    <div>
      <PageHeader title="Sales Pipeline" description="Drag a card between columns (or use the stage menu on the card) to update the lead and its opportunity." actions={<Button asChild variant="outline"><Link href="/leads"><Plus className="h-4 w-4" />All leads</Link></Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-deep" aria-hidden /><input aria-label="Search pipeline" className="field pl-9" placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Filter by owner" className="w-52" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All owners</option><option value="me">Assigned to me</option>{team.data?.data.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</Select>
      </div>
      {board.isError ? <QueryError error={board.error} retry={() => board.refetch()} /> : (
        <div className="flex gap-4 xl:grid-cols-[1fr_320px]" >
          <div className="min-w-0 flex-1 overflow-x-auto pb-4 scroll-thin" tabIndex={0} aria-label="Pipeline board">
            {board.isLoading ? <div className="flex gap-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}</div> : (
              <div className="flex gap-4">
                {stages.map((s) => {
                  const leads = s.leads.filter(filterLead);
                  return (
                    <section key={s.stage} aria-label={`${LEAD_STAGE_LABELS[s.stage as keyof typeof LEAD_STAGE_LABELS]} column`}
                      onDragOver={(e) => { if (dragging && sales) { e.preventDefault(); setOver(s.stage); } }} onDragLeave={() => setOver((o) => (o === s.stage ? null : o))}
                      onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging && sales) { const lead = stages.flatMap((x) => x.leads).find((l: any) => l.id === dragging); if (lead && lead.status !== s.stage) move.mutate({ id: dragging, status: s.stage }); } setDragging(null); }}
                      className={cn('flex max-h-[calc(100vh-260px)] min-h-[320px] w-72 shrink-0 flex-col overflow-hidden rounded-2xl border bg-cream/70 shadow-card transition', over === s.stage ? 'border-royal ring-2 ring-royal/30' : 'border-gold/45')}>
                      <header className={cn('flex items-center justify-between px-4 py-3', HEAD[s.stage])}>
                        <h2 className="font-display text-[15px] font-semibold !text-inherit">{LEAD_STAGE_LABELS[s.stage as keyof typeof LEAD_STAGE_LABELS]} <span className="ml-1 font-sans text-sm font-medium opacity-90">({s.count})</span></h2>
                        <span className="text-xs font-semibold opacity-90">{moneyCompact(s.totalValue, cur)}</span>
                      </header>
                      <ul className="flex-1 space-y-2.5 overflow-y-auto p-2.5 scroll-thin">
                        {leads.map((l: any) => (
                          <li key={l.id} draggable={sales} onDragStart={() => setDragging(l.id)} onDragEnd={() => { setDragging(null); setOver(null); }}
                            className={cn('group overflow-hidden rounded-xl border bg-ivory transition hover:-translate-y-0.5 hover:border-gold hover:shadow-lift', selected?.id === l.id ? 'border-royal ring-1 ring-royal/40' : 'border-gold/40', dragging === l.id && 'opacity-50')}>
                            <button className="relative block aspect-[16/9] w-full overflow-hidden bg-maroon" onClick={() => { setSelected(l); setIdeas(null); }} aria-label={`Open assistant for ${l.contact.name}`}>
                              {l.productImageUrl ? <img src={l.productImageUrl} alt={l.productImageName ?? l.productInterest ?? 'Product of interest'} loading="lazy" draggable={false} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="motif-bg flex h-full items-center justify-center text-gold/70"><Sparkles className="h-6 w-6" aria-hidden /></div>}
                              <span className="absolute inset-0 bg-gradient-to-t from-maroon-deep/75 via-transparent to-transparent" aria-hidden />
                              <span className="absolute bottom-1.5 left-2.5 right-2 flex items-end justify-between gap-2 text-left text-ivory"><span className="truncate font-display text-[13px] font-semibold drop-shadow">{l.productImageName ?? l.productInterest ?? 'General enquiry'}</span></span>
                              <span className="absolute right-2 top-2 rounded-full bg-ivory shadow-card"><ScoreChip score={l.leadScore} /></span>
                            </button>
                            <div className="p-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={l.contact.name} className="h-8 w-8" />
                                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold leading-tight">{l.contact.name}</p><p className="truncate text-[11px] text-ink-muted">{l.productInterest ?? 'General enquiry'} · {timeAgo(l.createdAt)}</p></div>
                                {sales && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gold-deep" aria-hidden />}
                              </div>
                              <div className="mt-2.5 flex items-center justify-between">
                                <span className="font-display text-base font-semibold text-royal">{l.estimatedValue ? moneyCompact(l.estimatedValue, cur) : budgetRange(l.budgetMin, l.budgetMax, cur)}</span>
                                {l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date() && !['WON', 'LOST'].includes(l.status) && <Pill tone="red">Follow-up due</Pill>}
                              </div>
                              {sales && <Select aria-label={`Move ${l.contact.name} to stage`} className="mt-2.5 !py-1 text-xs" value={l.status} onChange={(e) => move.mutate({ id: l.id, status: e.target.value })}>{LEAD_STAGES.map((st) => <option key={st} value={st}>{LEAD_STAGE_LABELS[st]}</option>)}</Select>}
                            </div>
                          </li>
                        ))}
                        {!leads.length && <li className="rounded-xl border border-dashed border-gold/40 py-8 text-center text-xs text-ink-muted">No leads here</li>}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {selected && (
            <aside className="hidden w-80 shrink-0 xl:block" aria-label="AI assistant">
              <div className="panel sticky top-24 space-y-4 p-5">
                <div className="flex items-start justify-between"><div className="flex items-center gap-2 font-display text-base font-semibold"><Bot className="h-5 w-5 text-gold-deep" />AI Assistant</div><button aria-label="Close assistant" onClick={() => setSelected(null)} className="rounded p-1 hover:bg-gold/15"><X className="h-4 w-4" /></button></div>
                {selected.productImageUrl && <img src={selected.productImageUrl} alt={selected.productImageName ?? 'Product of interest'} className="aspect-[16/10] w-full rounded-xl border border-gold/50 object-cover" />}
                <div className="flex items-center gap-3"><Avatar name={selected.contact.name} className="h-11 w-11" /><div><p className="font-semibold">{selected.contact.name}</p><p className="text-xs text-ink-muted">{selected.productInterest ?? 'General enquiry'} · {timeAgo(selected.createdAt)}</p></div></div>
                <div className="flex flex-wrap gap-1.5"><ScoreChip score={selected.leadScore} /><Pill tone="gold">{LEAD_STAGE_LABELS[selected.status as keyof typeof LEAD_STAGE_LABELS]}</Pill>{selected.contact.consentStatus !== 'GRANTED' && <Pill tone="red">No consent</Pill>}</div>
                {selected.qualificationReason && <div><p className="eyebrow !text-[10px]">Why this score</p><p className="mt-1 text-sm">{selected.qualificationReason}</p></div>}
                {selected.qualificationData?.suggested_next_action && <div><p className="eyebrow !text-[10px]">Suggested next action</p><p className="mt-1 text-sm">{selected.qualificationData.suggested_next_action}</p></div>}
                {ideas && <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm"><p className="mb-1 flex items-center gap-1.5 font-semibold"><Sparkles className="h-3.5 w-3.5 text-gold-deep" />Reply ideas{ideas.source !== 'LLM' && <Pill tone="gold" className="ml-1">Demo</Pill>}</p><ul className="list-disc space-y-1 pl-4">{ideas.suggestions.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                <div className="space-y-2">
                  {sales && <Button variant="outline" size="sm" className="w-full" loading={suggest.isPending} onClick={() => suggest.mutate(selected.id)}><Sparkles className="h-4 w-4" />AI reply ideas</Button>}
                  {sales && <Button size="sm" className="w-full" loading={draft.isPending} disabled={selected.contact.consentStatus !== 'GRANTED' || !selected.contact.email} onClick={() => draft.mutate(selected.id)}><Mail className="h-4 w-4" />Draft follow-up email</Button>}
                  <Button asChild variant="gold" size="sm" className="w-full"><Link href={`/leads/${selected.id}`}>Open lead details</Link></Button>
                </div>
                <Banner>Drafts are saved for review. Nothing is sent without approval.</Banner>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

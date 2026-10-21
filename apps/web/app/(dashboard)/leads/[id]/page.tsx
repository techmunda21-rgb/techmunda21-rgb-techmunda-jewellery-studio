'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, CalendarClock, Mail, MapPin, MessageSquareText, Phone, ShieldCheck, Sparkles, StickyNote, Wand2 } from 'lucide-react';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@techmunda/shared';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Avatar, Banner, QueryError } from '@/components/ui/misc';
import { Pill, StatusPill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_SALES, useAuth } from '@/lib/auth';
import { actionLabel, budgetRange, dateOnly, dateTime, timeAgo } from '@/lib/format';
import { useTeam } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { stageTone } from '@/components/features/lead-ui';

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-gold/20 py-2.5 text-sm last:border-0"><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{children}</dd></div>
);

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { can, me } = useAuth();
  const team = useTeam();
  const [note, setNote] = useState('');
  const [task, setTask] = useState({ title: '', dueAt: '' });
  const [suggestions, setSuggestions] = useState<{ suggestions: string[]; source: string } | null>(null);
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api<any>(`/leads/${id}`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['lead', id] }); void qc.invalidateQueries({ queryKey: ['leads'] }); void qc.invalidateQueries({ queryKey: ['board'] }); };
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  const qualify = useMutation({ mutationFn: () => api(`/leads/${id}/qualify`, { method: 'POST' }), onSuccess: () => { toast.success('Qualification started.'); setTimeout(refresh, 1200); setTimeout(refresh, 3500); }, onError: onErr });
  const patch = useMutation({ mutationFn: (b: object) => api(`/leads/${id}`, { method: 'PATCH', body: b }), onSuccess: refresh, onError: onErr });
  const addNote = useMutation({ mutationFn: () => api(`/leads/${id}/notes`, { method: 'POST', body: { body: note } }), onSuccess: () => { setNote(''); refresh(); }, onError: onErr });
  const addTask = useMutation({ mutationFn: () => api(`/leads/${id}/tasks`, { method: 'POST', body: { title: task.title, dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : undefined } }), onSuccess: () => { setTask({ title: '', dueAt: '' }); refresh(); void qc.invalidateQueries({ queryKey: ['tasks'] }); }, onError: onErr });
  const doneTask = useMutation({ mutationFn: (tid: string) => api(`/tasks/${tid}`, { method: 'PATCH', body: { completed: true } }), onSuccess: () => { refresh(); void qc.invalidateQueries({ queryKey: ['tasks'] }); }, onError: onErr });
  const suggest = useMutation({ mutationFn: () => api<any>(`/leads/${id}/suggest-reply`, { method: 'POST', body: { tone: 'warm' } }), onSuccess: setSuggestions, onError: onErr });
  const draft = useMutation({ mutationFn: () => api<any>('/communications/drafts', { method: 'POST', body: { leadId: id, generate: true } }), onSuccess: (d) => { toast.success('Draft created and queued for review. Nothing has been sent.'); router.push(`/approvals?draft=${d.id}`); }, onError: onErr });
  const withdraw = useMutation({ mutationFn: () => api(`/contacts/${lead.data.contact.id}/consent/withdraw`, { method: 'POST' }), onSuccess: () => { toast.success('Consent withdrawn. No further outreach is possible.'); refresh(); }, onError: onErr });

  if (lead.isError) return <QueryError error={lead.error} retry={() => lead.refetch()} />;
  if (lead.isLoading || !lead.data) return <Skeleton className="h-[600px]" />;
  const l = lead.data;
  const q = l.qualificationData as any;
  const cur = me?.tenant.currency ?? 'INR';
  const sales = can(...CAN_SALES);
  const score: number | null = l.leadScore;

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"><ArrowLeft className="h-4 w-4" />Lead Qualification</Link>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr_1fr]">
        {/* lead details */}
        <Panel>
          <PanelHeader title="Lead Details" />
          <div className="p-5">
            <div className="mb-4 flex items-center gap-3"><Avatar name={l.contact.name} className="h-14 w-14 text-base" /><div><p className="font-display text-xl font-semibold leading-tight">{l.contact.name}</p><Pill tone={stageTone(l.status)} className="mt-1">{LEAD_STAGE_LABELS[l.status as keyof typeof LEAD_STAGE_LABELS]}</Pill></div></div>
            <ul className="space-y-2 text-sm">
              {l.contact.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold-deep" aria-hidden />{l.contact.phone}</li>}
              {l.contact.email && <li className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-gold-deep" aria-hidden />{l.contact.email}</li>}
              {(l.contact.city || l.contact.country) && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gold-deep" aria-hidden />{[l.contact.city, l.contact.country].filter(Boolean).join(', ')}</li>}
            </ul>
            <dl className="mt-3">
              <Row k="Source">{l.source.replace(/_/g, ' ')}</Row>
              <Row k="Submitted">{dateTime(l.createdAt)}</Row>
              <Row k="Appointment">{l.appointmentDate ? dateOnly(l.appointmentDate) : '—'}</Row>
              <Row k="Consent"><span className={cn('inline-flex items-center gap-1', l.contact.consentStatus === 'GRANTED' ? 'text-status-approved' : 'text-status-rejected')}><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{l.contact.consentStatus.replace('_', ' ').toLowerCase()}</span>{l.contact.consentTimestamp && <span className="block text-xs font-normal text-ink-muted">{dateTime(l.contact.consentTimestamp)}</span>}</Row>
            </dl>
            {sales && (
              <div className="mt-3 space-y-3">
                <div><label htmlFor="stage" className="mb-1 block text-xs font-semibold text-ink-muted">Pipeline stage</label><Select id="stage" value={l.status} onChange={(e) => patch.mutate({ status: e.target.value })}>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>)}</Select></div>
                <div><label htmlFor="assignee" className="mb-1 block text-xs font-semibold text-ink-muted">Assigned to</label><Select id="assignee" value={l.assignedTo ?? ''} onChange={(e) => patch.mutate({ assignedTo: e.target.value || null })}><option value="">Unassigned</option>{team.data?.data.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</Select></div>
                {l.contact.consentStatus === 'GRANTED' && <Button variant="danger" size="sm" className="w-full" loading={withdraw.isPending} onClick={() => confirm('Record that this contact withdrew consent? All open drafts will be cancelled.') && withdraw.mutate()}>Record consent withdrawal</Button>}
              </div>
            )}
          </div>
        </Panel>

        {/* AI qualification */}
        <Panel>
          <PanelHeader title="AI Qualification Result" action={q && <Pill tone={l.qualificationSource === 'LLM' ? 'green' : 'gold'}><Bot className="h-3 w-3" />{l.qualificationSource === 'LLM' ? 'Live AI' : 'Demo simulation'}</Pill>} />
          <div className="space-y-4 p-5">
            <div><p className="eyebrow !text-[10px]">Customer message</p><blockquote className="mt-1 rounded-xl border border-gold/35 bg-cream/70 p-3.5 text-sm leading-relaxed">{l.message ? `“${l.message}”` : <span className="text-ink-muted">No message supplied.</span>}</blockquote></div>
            {sales && <Button variant="gold" className="w-full" loading={qualify.isPending} onClick={() => qualify.mutate()}><Sparkles className="h-4 w-4" />Run AI Qualification</Button>}
            <div className="space-y-3">
              <div><p className="eyebrow !text-[10px]">Reason</p><p className="mt-1 text-sm">{l.qualificationReason ?? 'Not yet qualified.'}</p></div>
              <div><p className="eyebrow !text-[10px]">Suggested next action <span className="normal-case tracking-normal text-ink-muted">(internal only)</span></p><p className="mt-1 text-sm">{q?.suggested_next_action ?? '—'}</p></div>
            </div>
            <Banner>The score is a prioritisation heuristic, not a prediction of purchase probability. Fields that were not stated stay empty rather than guessed.</Banner>
          </div>
        </Panel>

        {/* extracted info */}
        <Panel>
          <PanelHeader title="Extracted Information" />
          <div className="p-5">
            <dl>
              <Row k="Intent">{q?.intent ? <Pill tone="green" className="capitalize">{q.intent}</Pill> : '—'}</Row>
              <Row k="Product category">{l.productInterest ?? <span className="text-ink-muted">Not stated</span>}</Row>
              <Row k="Budget range">{budgetRange(l.budgetMin, l.budgetMax, cur)}</Row>
              <Row k="Purchase timeline">{l.purchaseTimeline ?? <span className="text-ink-muted">Not stated</span>}</Row>
              <Row k="Preferred material">{l.preferredMaterial ?? <span className="text-ink-muted">Not stated</span>}</Row>
            </dl>
            <div className="mt-4"><p className="eyebrow !text-[10px]">Qualification score</p>
              <div className="mt-2 flex items-center gap-3"><div className="h-3 flex-1 overflow-hidden rounded-full bg-gold/25" role="progressbar" aria-valuenow={score ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Qualification score"><div className="h-full rounded-full bg-gradient-to-r from-gold to-status-approved" style={{ width: `${score ?? 0}%` }} /></div><span className="font-display text-xl font-semibold">{score ?? '—'}<span className="text-xs font-normal text-ink-muted">/100</span></span></div>
              {q?.scoreBreakdown && <ul className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[10px] text-ink-muted">{Object.entries(q.scoreBreakdown).map(([k, v]) => <li key={k} className="rounded-lg border border-gold/30 bg-cream/60 py-1.5"><span className="block font-display text-sm font-semibold text-ink">{String(v)}</span>{k}</li>)}</ul>}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-gold/35 bg-cream/60 px-3.5 py-2.5 text-sm"><span>Requires human review</span><Pill tone={l.requiresHumanReview ? 'gold' : 'green'}>{l.requiresHumanReview ? 'Yes' : 'No'}</Pill></div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Follow-up" description="Everything below needs a human decision before anything reaches the customer." action={sales && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" loading={suggest.isPending} onClick={() => suggest.mutate()}><Wand2 className="h-4 w-4" />AI reply ideas</Button><Button size="sm" loading={draft.isPending} disabled={l.contact.consentStatus !== 'GRANTED' || !l.contact.email} onClick={() => draft.mutate()}><Mail className="h-4 w-4" />Draft follow-up email</Button></div>} />
          <div className="space-y-4 p-5">
            {l.contact.consentStatus !== 'GRANTED' && <Banner tone="warn" title="Email outreach is blocked">There is no active consent to contact this person by email.</Banner>}
            {suggestions && <div className="rounded-xl border border-gold/40 bg-gold/10 p-4"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-gold-deep" />AI suggestions {suggestions.source !== 'LLM' && <Pill tone="gold">Demo simulation</Pill>}</p><ul className="list-disc space-y-1 pl-5 text-sm">{suggestions.suggestions.map((s) => <li key={s}>{s}</li>)}</ul></div>}
            <div>
              <h3 className="mb-2 font-display text-base font-semibold">Email drafts</h3>
              {l.drafts.length ? <ul className="divide-y divide-gold/20 rounded-xl border border-gold/35">{l.drafts.map((d: any) => <li key={d.id}><Link href={`/approvals?draft=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gold/10"><span className="min-w-0"><span className="block truncate text-sm font-medium">{d.subject}</span><span className="block text-xs text-ink-muted">v{d.version} · {timeAgo(d.createdAt)}</span></span><StatusPill status={d.status} /></Link></li>)}</ul> : <p className="text-sm text-ink-muted">No drafts yet.</p>}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold"><StickyNote className="h-4 w-4 text-gold-deep" />Notes</h3>
                {sales && <div className="mb-3 space-y-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="New note" className="min-h-[64px]" /><Button size="sm" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button></div>}
                <ul className="space-y-2">{l.notes.map((n: any) => <li key={n.id} className="rounded-lg border border-gold/30 bg-cream/60 p-2.5 text-sm">{n.body}<span className="mt-1 block text-[11px] text-ink-muted">{timeAgo(n.createdAt)}</span></li>)}{!l.notes.length && <li className="text-sm text-ink-muted">No notes.</li>}</ul>
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold"><CalendarClock className="h-4 w-4 text-gold-deep" />Tasks &amp; reminders</h3>
                {sales && <div className="mb-3 space-y-2"><Input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="e.g. Call to confirm appointment" aria-label="Task title" /><Input type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} aria-label="Due date" /><Button size="sm" disabled={task.title.trim().length < 2} loading={addTask.isPending} onClick={() => addTask.mutate()}>Add task</Button></div>}
                <ul className="space-y-2">{l.tasks.map((t: any) => <li key={t.id} className="flex items-start gap-2 rounded-lg border border-gold/30 bg-cream/60 p-2.5 text-sm"><input type="checkbox" aria-label={`Complete ${t.title}`} className="mt-1 h-4 w-4 accent-[rgb(var(--royal))]" checked={!!t.completedAt} disabled={!!t.completedAt || !sales} onChange={() => doneTask.mutate(t.id)} /><span className={cn(t.completedAt && 'line-through opacity-60')}>{t.title}{t.dueAt && <span className="block text-[11px] text-ink-muted">Due {dateTime(t.dueAt)}</span>}</span></li>)}{!l.tasks.length && <li className="text-sm text-ink-muted">No tasks.</li>}</ul>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Timeline" description="CRM activity & communication history" />
          <ol className="relative max-h-[640px] space-y-0 overflow-y-auto p-5 scroll-thin">
            {l.activities.map((a: any) => (
              <li key={a.id} className="relative border-l border-gold/50 pb-5 pl-5 last:pb-0">
                <span className={cn('absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border border-gold', a.action === 'email.sent' ? 'bg-status-sent' : a.action.includes('approved') ? 'bg-status-approved' : 'bg-gold')} />
                <p className="text-sm font-medium">{actionLabel(a.action)}</p>
                {a.metadata && (a.metadata.to || a.metadata.score != null || a.metadata.subject) && <p className="text-xs text-ink-muted">{a.metadata.to ? `→ ${LEAD_STAGE_LABELS[a.metadata.to as keyof typeof LEAD_STAGE_LABELS] ?? a.metadata.to}` : a.metadata.subject ?? `Score ${a.metadata.score}`}</p>}
                <p className="text-[11px] text-gold-deep">{timeAgo(a.createdAt)}</p>
              </li>
            ))}
            {!l.activities.length && <li className="text-sm text-ink-muted"><MessageSquareText className="mr-1 inline h-4 w-4" />No activity yet.</li>}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Megaphone, Plus } from 'lucide-react';
import { campaignInputSchema } from '@techmunda/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Banner, EmptyState, QueryError } from '@/components/ui/misc';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateOnly, money } from '@/lib/format';

const TYPES = [['FESTIVE', 'Festive (Diwali, Akshaya Tritiya…)'], ['BRIDAL', 'Bridal'], ['LUXURY', 'Luxury'], ['ECOMMERCE', 'E-commerce'], ['OTHER', 'Other']] as const;
const form = campaignInputSchema.extend({ budget: z.union([z.coerce.number().nonnegative(), z.literal('').transform(() => null)]).nullish(), startDate: z.union([z.coerce.date(), z.literal('').transform(() => null)]).nullish(), endDate: z.union([z.coerce.date(), z.literal('').transform(() => null)]).nullish() });
type V = z.input<typeof form>;

function CreateForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<V>({ resolver: zodResolver(form), defaultValues: { campaignType: 'FESTIVE', currency: me?.tenant.currency ?? 'INR' } });
  const m = useMutation({ mutationFn: (b: unknown) => api('/campaigns', { method: 'POST', body: b }), onSuccess: () => { toast.success('Campaign created as a draft.'); void qc.invalidateQueries({ queryKey: ['campaigns'] }); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => m.mutate(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null))))}>
      <Field label="Campaign name" htmlFor="c-name" error={errors.name?.message} required className="sm:col-span-2"><Input id="c-name" placeholder="Diwali 2026 — Festive Gold" {...register('name')} /></Field>
      <Field label="Type" htmlFor="c-type"><Select id="c-type" {...register('campaignType')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Budget" htmlFor="c-budget" error={errors.budget?.message as string}><Input id="c-budget" inputMode="decimal" {...register('budget')} /></Field>
      <Field label="Start date" htmlFor="c-start"><Input id="c-start" type="date" {...register('startDate')} /></Field>
      <Field label="End date" htmlFor="c-end"><Input id="c-end" type="date" {...register('endDate')} /></Field>
      <Field label="Description" htmlFor="c-desc" className="sm:col-span-2"><Textarea id="c-desc" {...register('description')} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" loading={m.isPending}>Create campaign</Button></div>
    </form>
  );
}

function Attach({ campaign, onDone }: { campaign: any; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const assets = useQuery({ queryKey: ['assets', 'APPROVED'], queryFn: () => api<any>('/creatives/assets', { query: { status: 'APPROVED' } }) });
  const [sel, setSel] = useState<string[]>([]);
  const attached = new Set(campaign.assets.map((a: any) => a.id));
  const m = useMutation({ mutationFn: () => api(`/campaigns/${campaign.id}`, { method: 'PATCH', body: { attachAssetIds: sel } }), onSuccess: () => { toast.success('Approved assets attached.'); void qc.invalidateQueries({ queryKey: ['campaigns'] }); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  const options = (assets.data?.data ?? []).filter((a: any) => !attached.has(a.id));
  return (
    <div>
      <Banner className="mb-3">Only approved assets can be attached. Unapproved assets can never be published.</Banner>
      {assets.isLoading ? <Skeleton className="h-32" /> : !options.length ? <p className="text-sm text-ink-muted">No approved assets available to attach.</p> : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{options.map((a: any) => (
          <li key={a.id}><button aria-pressed={sel.includes(a.id)} onClick={() => setSel(sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id])} className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-maroon-deep ${sel.includes(a.id) ? 'border-royal' : 'border-gold/40'}`}><img src={a.url} alt={`${a.productName} approved asset`} className="h-full w-full object-cover" /></button></li>
        ))}</ul>
      )}
      <div className="mt-4 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Close</Button></DialogClose><Button disabled={!sel.length} loading={m.isPending} onClick={() => m.mutate()}>Attach {sel.length || ''} asset(s)</Button></div>
    </div>
  );
}

export default function CampaignsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [attach, setAttach] = useState<any | null>(null);
  const list = useQuery({ queryKey: ['campaigns'], queryFn: () => api<any>('/campaigns') });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/campaigns/${id}`, { method: 'PATCH', body: { status } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['campaigns'] }), onError: (e) => toast.error(errorMessage(e)) });
  const writer = can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER');

  return (
    <div>
      <PageHeader title="Campaigns" description="Group approved creative assets into festive, bridal and luxury campaigns." actions={writer && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New campaign</Button>} />
      <Banner className="mb-5">Marking a campaign <strong>Active</strong> records that it is cleared to publish. This studio does not post to ad or social platforms — your team publishes the approved assets.</Banner>
      {list.isError ? <QueryError error={list.error} retry={() => list.refetch()} /> : list.isLoading ? <Skeleton className="h-64" /> : !list.data.data.length ? <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to organise approved creative assets." /> : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data.data.map((c: any) => {
          const approved = c.assets.filter((a: any) => a.reviewStatus === 'APPROVED').length;
          return (
            <li key={c.id}><Panel className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2"><h2 className="font-display text-lg font-semibold leading-snug">{c.name}</h2><Pill tone={c.status === 'ACTIVE' ? 'green' : c.status === 'DRAFT' ? 'muted' : 'gold'}>{c.status}</Pill></div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">{c.campaignType}</p>
              {c.description && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{c.description}</p>}
              <dl className="mt-3 space-y-1 text-sm"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gold-deep" aria-hidden />{c.startDate ? `${dateOnly(c.startDate)} → ${dateOnly(c.endDate)}` : 'Dates not set'}</div><div>Budget: <strong>{money(c.budget, c.currency)}</strong></div><div>Approved assets: <strong>{approved}</strong></div></dl>
              {writer && <div className="mt-auto flex flex-wrap gap-2 pt-4"><Button size="sm" variant="outline" onClick={() => setAttach(c)}>Attach assets</Button>
                {c.status === 'DRAFT' && <Button size="sm" variant="gold" onClick={() => setStatus.mutate({ id: c.id, status: 'READY' })}>Mark ready</Button>}
                {c.status === 'READY' && can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER') && <Button size="sm" onClick={() => setStatus.mutate({ id: c.id, status: 'ACTIVE' })}>Activate</Button>}
                {c.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: c.id, status: 'COMPLETED' })}>Complete</Button>}</div>}
            </Panel></li>
          );
        })}</ul>
      )}
      <Dialog open={creating} onOpenChange={setCreating}><DialogContent wide title="New campaign"><CreateForm onDone={() => setCreating(false)} /></DialogContent></Dialog>
      <Dialog open={!!attach} onOpenChange={(o) => !o && setAttach(null)}><DialogContent wide title={`Attach assets — ${attach?.name ?? ''}`}>{attach && <Attach campaign={attach} onDone={() => setAttach(null)} />}</DialogContent></Dialog>
    </div>
  );
}

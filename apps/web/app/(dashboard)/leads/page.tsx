'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Search, Users } from 'lucide-react';
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@techmunda/shared';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/form';
import { Avatar, Banner, EmptyState, QueryError } from '@/components/ui/misc';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_SALES, useAuth } from '@/lib/auth';
import { budgetRange, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScoreChip, stageTone } from '@/components/features/lead-ui';

const SAMPLE = 'name,email,phone,product_interest,city\nAsha Rao,asha.rao@example.com,+91 90000 11111,Ring,Pune\n';

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const prev = useMutation({ mutationFn: () => api<any>('/leads/import/preview', { method: 'POST', body: { csv } }), onSuccess: setPreview, onError: (e) => toast.error(errorMessage(e)) });
  const commit = useMutation({
    mutationFn: () => api<any>('/leads/import/commit', { method: 'POST', body: { rows: preview.rows.filter((r: any) => r.importable).map(({ name, email, phone, productInterest, city }: any) => ({ name, email, phone, productInterest, city })) } }),
    onSuccess: (r) => { toast.success(`${r.created} lead(s) imported.`); void qc.invalidateQueries({ queryKey: ['leads'] }); setPreview(null); setCsv(''); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPreview(null); }}>
      <DialogContent wide title="Import leads from CSV" description="Review duplicates and problems before anything is inserted. Imported contacts have no marketing consent.">
        {!preview ? (
          <>
            <input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" className="mb-3 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-gold file:bg-gold/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
            <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} className="min-h-[160px] font-mono text-xs" aria-label="CSV contents" />
            <p className="mt-1 text-xs text-ink-muted">Columns: name, email, phone, product_interest, city (header row required, up to 1,000 rows).</p>
            <div className="mt-4 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled={!csv.trim()} loading={prev.isPending} onClick={() => prev.mutate()}>Preview import</Button></div>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-sm"><Pill tone="green">{preview.summary.importable} ready</Pill><Pill tone="gold">{preview.summary.duplicates} duplicates</Pill><Pill tone="red">{preview.summary.invalid} invalid</Pill></div>
            <div className="max-h-72 overflow-auto rounded-xl border border-gold/40">
              <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-cream"><tr>{['Row', 'Name', 'Email / phone', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{preview.rows.map((r: any) => (
                  <tr key={r.row} className="border-t border-gold/20"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.email ?? r.phone}</td>
                    <td className="px-3 py-2">{r.importable ? <Pill tone="green">Ready</Pill> : r.duplicateOf ? <Pill tone="gold">Duplicate ({r.duplicateOf})</Pill> : <Pill tone="red">{r.problems.join(', ')}</Pill>}</td></tr>
                ))}</tbody></table>
            </div>
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Back</Button><Button disabled={!preview.summary.importable} loading={commit.isPending} onClick={() => commit.mutate()}>Import {preview.summary.importable} lead(s)</Button></div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadsList() {
  const sp = useSearchParams();
  const { can, me } = useAuth();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const list = useQuery({ queryKey: ['leads', q, status, mine, page], queryFn: () => api<any>('/leads', { query: { q, status, page, pageSize: 15, assignedTo: mine ? 'me' : undefined } }), placeholderData: (p) => p });
  const cur = me?.tenant.currency ?? 'INR';

  return (
    <div>
      <PageHeader title="Leads" description="Every enquiry, AI-qualified and ready for follow-up." actions={<>
        {can(...CAN_SALES) && <Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import CSV</Button>}
        {me && <Button asChild variant="gold"><a href={`/enquiry/${me.tenant.slug}`} target="_blank" rel="noopener">Open public enquiry page</a></Button>}
      </>} />
      <Panel className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-deep" aria-hidden /><input aria-label="Search leads" className="field pl-9" placeholder="Search name, email, phone, product…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <Select aria-label="Filter by stage" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All stages</option>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>)}</Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--royal))]" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />Assigned to me</label>
      </Panel>
      {list.isError ? <QueryError error={list.error} retry={() => list.refetch()} /> : list.isLoading ? <Skeleton className="h-96" /> : !list.data.data.length ? (
        <EmptyState icon={Users} title="No leads match" description="Try clearing your filters, or share the public enquiry page to capture new leads." />
      ) : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-cream/70 text-xs uppercase tracking-wider text-ink-muted"><tr>{['Contact', 'Interest', 'Budget', 'Score', 'Stage', 'Received'].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gold/20">{list.data.data.map((l: any) => (
              <tr key={l.id} className="hover:bg-gold/10">
                <td className="px-4 py-3"><Link href={`/leads/${l.id}`} className="flex items-center gap-3 font-semibold hover:text-royal"><Avatar name={l.contact.name} className="h-9 w-9" /><span>{l.contact.name}<span className="block text-xs font-normal text-ink-muted">{l.contact.email ?? l.contact.phone}</span></span></Link></td>
                <td className="px-4 py-3"><span className="flex items-center gap-2.5">{l.productImageUrl && <img src={l.productImageUrl} alt="" className="h-9 w-12 rounded-md border border-gold/40 object-cover" />}{l.productInterest ?? '—'}</span></td>
                <td className="px-4 py-3 whitespace-nowrap">{budgetRange(l.budgetMin, l.budgetMax, cur)}</td>
                <td className="px-4 py-3"><ScoreChip score={l.leadScore} /></td>
                <td className="px-4 py-3"><Pill tone={stageTone(l.status)}>{LEAD_STAGE_LABELS[l.status as keyof typeof LEAD_STAGE_LABELS]}</Pill></td>
                <td className="px-4 py-3 text-ink-muted">{timeAgo(l.createdAt)}</td>
              </tr>))}</tbody>
          </table></div>
          <div className={cn('flex items-center justify-between border-t border-gold/25 px-4 py-3 text-sm', list.data.meta.totalPages <= 1 && 'justify-end')}>
            <span className="text-ink-muted">{list.data.meta.total} lead{list.data.meta.total === 1 ? '' : 's'}</span>
            {list.data.meta.totalPages > 1 && <nav className="flex items-center gap-2" aria-label="Pagination"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} / {list.data.meta.totalPages}</span><Button variant="outline" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button></nav>}
          </div>
        </Panel>
      )}
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <Banner className="mt-4">Lead scores are a prioritisation heuristic (intent, budget, timeline, specificity, appointment) — not a prediction of purchase probability.</Banner>
    </div>
  );
}

export default function LeadsPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><LeadsList /></Suspense>;
}

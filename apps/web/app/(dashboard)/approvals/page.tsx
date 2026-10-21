'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, Image as ImageIcon, Mail, Send } from 'lucide-react';
import { PageHeader } from '@/components/ui/card';
import { EmptyState, QueryError } from '@/components/ui/misc';
import { StatusPill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DraftReview } from '@/components/features/draft-review';
import { AssetReview } from '@/components/features/asset-review';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tab = 'emails' | 'assets';

function Approvals() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>('emails');
  const [selected, setSelected] = useState<string | null>(sp.get('draft'));
  const [filter, setFilter] = useState<'' | 'PENDING_REVIEW' | 'APPROVED'>('');
  const drafts = useQuery({ queryKey: ['drafts', filter], queryFn: () => api<any>('/communications/drafts', { query: { pageSize: 50, status: filter } }), refetchInterval: 20_000 });
  const assets = useQuery({ queryKey: ['assets', 'PENDING_REVIEW'], queryFn: () => api<any>('/creatives/assets', { query: { status: 'PENDING_REVIEW' } }), enabled: tab === 'assets' });
  const pendingAssets = useQuery({ queryKey: ['assets', 'PENDING_REVIEW', 'count'], queryFn: () => api<any>('/creatives/assets', { query: { status: 'PENDING_REVIEW' } }) });

  useEffect(() => { const h = (e: Event) => setSelected((e as CustomEvent).detail); window.addEventListener('draft:select', h); return () => window.removeEventListener('draft:select', h); }, []);
  useEffect(() => { if (!selected && drafts.data?.data.length) setSelected(drafts.data.data[0].id); }, [drafts.data, selected]);
  const pendingEmails = drafts.data?.data.filter((d: any) => d.status === 'PENDING_REVIEW').length ?? 0;
  const ready = drafts.data?.data.filter((d: any) => d.status === 'APPROVED').length ?? 0;

  return (
    <div>
      <PageHeader title="Approvals" description="Nothing is published or sent until a person reviews it. Approving an email and sending it are two separate actions." />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {([['emails', 'Gmail drafts', Mail, pendingEmails + ready], ['assets', 'Creative assets', ImageIcon, pendingAssets.data?.data.length ?? 0]] as const).map(([k, label, I, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition', tab === k ? 'border-royal bg-royal text-ivory' : 'border-gold/50 bg-ivory hover:bg-gold/10')}>
            <I className="h-4 w-4" aria-hidden />{label}{n > 0 && <span className={cn('rounded-full px-1.5 text-[11px]', tab === k ? 'bg-ivory/25' : 'bg-royal text-ivory')}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'emails' ? (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs font-semibold">{([['', 'All'], ['PENDING_REVIEW', 'Pending'], ['APPROVED', 'Ready to send']] as const).map(([k, label]) => <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn('rounded-full border px-3 py-1', filter === k ? 'border-royal bg-royal/10 text-royal' : 'border-gold/50 bg-ivory hover:bg-gold/10')}>{label}</button>)}</div>
            {drafts.isError ? <QueryError error={drafts.error} retry={() => drafts.refetch()} /> : drafts.isLoading ? <Skeleton className="h-64" /> : !drafts.data.data.length ? <EmptyState icon={CheckSquare} title="Nothing to review" description="Create a follow-up draft from a lead to see it here." /> : (
              <ul className="panel max-h-[70vh] divide-y divide-gold/20 overflow-y-auto scroll-thin">
                {drafts.data.data.map((d: any) => (
                  <li key={d.id}><button onClick={() => setSelected(d.id)} aria-current={selected === d.id} className={cn('w-full px-4 py-3 text-left transition hover:bg-gold/10', selected === d.id && 'bg-gold/15')}>
                    <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{d.leadName}</p><StatusPill status={d.status} className="shrink-0 !px-2 !text-[10px]" /></div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{d.subject}</p><p className="mt-0.5 text-[11px] text-gold-deep">{timeAgo(d.updatedAt)} · v{d.version}</p>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">{selected ? <DraftReview key={selected} id={selected} /> : <EmptyState icon={Send} title="Select a draft" description="Choose a draft on the left to review it." />}</div>
        </div>
      ) : assets.isLoading ? <Skeleton className="h-96" /> : assets.isError ? <QueryError error={assets.error} /> : !assets.data.data.length ? (
        <EmptyState icon={ImageIcon} title="No assets awaiting review" description="Assets appear here after a designer submits them for review." />
      ) : (
        <div className="space-y-8">{assets.data.data.map((a: any) => <div key={a.id}><h2 className="mb-2 font-display text-lg font-semibold">{a.productName}</h2><AssetReview assets={[a]} sourceUrl={a.sourceUrl} style={a.style} prompt={a.prompt} productName={a.productName} /></div>)}</div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Approvals /></Suspense>;
}

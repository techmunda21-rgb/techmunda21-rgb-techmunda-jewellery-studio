'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImageIcon, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { ASPECT_RATIOS, CREATIVE_STYLES } from '@techmunda/shared';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/card';
import { Label, Select, Textarea } from '@/components/ui/form';
import { Banner, EmptyState, QueryError } from '@/components/ui/misc';
import { ModeBadge, StatusPill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dropzone } from '@/components/features/dropzone';
import { AssetReview, type ReviewAsset } from '@/components/features/asset-review';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_MAKE_CREATIVE, useAuth } from '@/lib/auth';
import { useAiStatus } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';

const RATIO_LABEL: Record<string, string> = { '1:1': 'Square', '4:5': 'Portrait', '9:16': 'Story', '16:9': 'Landscape' };
const RATIO_BOX: Record<string, string> = { '1:1': 'h-6 w-6', '4:5': 'h-7 w-[22px]', '9:16': 'h-8 w-[18px]', '16:9': 'h-[18px] w-8' };

function Step({ n, title, children, className }: { n: number; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('panel p-5', className)} aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold bg-royal text-xs font-bold text-ivory">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

function Studio() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const ai = useAiStatus();
  const [tab, setTab] = useState<'create' | 'library'>('create');
  const [productId, setProductId] = useState(params.get('productId') ?? '');
  const [mediaId, setMediaId] = useState('');
  const [style, setStyle] = useState<string>(CREATIVE_STYLES[2].id);
  const [ratio, setRatio] = useState<string>('4:5');
  const [variations, setVariations] = useState(2);
  const [notes, setNotes] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => api<any>('/products', { query: { pageSize: 100 } }) });
  const product = useQuery({ queryKey: ['product', productId], queryFn: () => api<any>(`/products/${productId}`), enabled: !!productId });
  const originals: any[] = product.data?.media?.filter((m: any) => m.isOriginal && m.mediaKind === 'PHOTO') ?? [];
  useEffect(() => { if (originals.length && !originals.some((m) => m.id === mediaId)) setMediaId(originals[originals.length - 1].id); if (!originals.length) setMediaId(''); }, [productId, originals.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const job = useQuery({
    queryKey: ['job', jobId], queryFn: () => api<any>(`/creatives/jobs/${jobId}`), enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['QUEUED', 'RUNNING'].includes(q.state.data.status) ? 1500 : false),
  });
  useEffect(() => { if (job.data?.status === 'COMPLETED') resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [job.data?.status]);
  const recent = useQuery({ queryKey: ['jobs'], queryFn: () => api<any>('/creatives/jobs') });
  const assets = useQuery({ queryKey: ['assets', filter], queryFn: () => api<any>('/creatives/assets', { query: { status: filter } }), enabled: tab === 'library' });

  const generate = useMutation({
    mutationFn: () => api<any>('/creatives/jobs', { method: 'POST', body: { productId, sourceMediaId: mediaId, style, aspectRatio: ratio, variations, promptNotes: notes || undefined } }),
    onSuccess: (j) => { setJobId(j.id); void qc.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const canMake = can(...CAN_MAKE_CREATIVE);
  const simulated = ai.data?.image?.mode === 'SIMULATED';
  const running = generate.isPending || (job.data && ['QUEUED', 'RUNNING'].includes(job.data.status));

  return (
    <div>
      <PageHeader title="Create Stunning Jewellery Visuals" description="Upload product photos and generate styled marketing assets. Every asset needs human approval before it can be used." actions={<div className="flex rounded-lg border border-gold/60 bg-ivory p-0.5" role="tablist">{(['create', 'library'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('rounded-md px-4 py-1.5 text-sm font-semibold transition', tab === t ? 'bg-royal text-ivory' : 'text-ink hover:bg-gold/10')}>{t === 'create' ? 'Create' : 'Review & Library'}</button>)}</div>} />
      {simulated && <Banner tone="warn" title="Demo simulation active" className="mb-5">No image-AI provider key is configured, so outputs are your original photo styled onto a backdrop — <strong>not</strong> AI renders. Set <code className="rounded bg-ink/10 px-1">OPENAI_API_KEY</code> to enable live generation.</Banner>}

      {tab === 'create' ? (
        <div className="space-y-5">
          {!canMake && <Banner>Your role can review assets but cannot create new jobs.</Banner>}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <Step n={1} title="Select Product">
              {products.isError ? <QueryError error={products.error} /> : (
                <>
                  <Label htmlFor="cs-product">Product</Label>
                  <Select id="cs-product" value={productId} onChange={(e) => { setProductId(e.target.value); setJobId(null); }}>
                    <option value="">Choose a product…</option>
                    {products.data?.data.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
                  </Select>
                  {product.data && <p className="mt-2 text-xs text-ink-muted">{[product.data.metalType, product.data.purity, product.data.stoneType].filter(Boolean).join(' · ') || 'No specs recorded'} — specs come only from your catalogue.</p>}
                </>
              )}
            </Step>
            <Step n={2} title="Upload Image">
              {originals.length > 0 && (
                <div className="mb-3"><p className="mb-1.5 text-xs font-medium text-ink-muted">Use an uploaded original</p>
                  <ul className="flex gap-2 overflow-x-auto pb-1 scroll-thin" aria-label="Original images">{originals.map((m: any) => (
                    <li key={m.id}><button onClick={() => setMediaId(m.id)} aria-pressed={mediaId === m.id} className={cn('relative block h-20 w-20 overflow-hidden rounded-lg border-2 bg-maroon-deep', mediaId === m.id ? 'border-royal' : 'border-gold/40 hover:border-gold')}><img src={m.url} alt="Original upload" className="h-full w-full object-cover" />{mediaId === m.id && <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 rounded-full bg-ivory text-royal" />}</button></li>
                  ))}</ul></div>
              )}
              <Dropzone productId={productId || undefined} disabled={!canMake} compact onUploaded={(m) => { void qc.invalidateQueries({ queryKey: ['product', productId] }).then(() => setMediaId(m.id)); }} />
            </Step>
          </div>

          <Step n={3} title="Choose Style">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" role="radiogroup" aria-label="Style presets">
              {CREATIVE_STYLES.map((s) => (
                <li key={s.id}>
                  <button role="radio" aria-checked={style === s.id} onClick={() => setStyle(s.id)} className={cn('group w-full overflow-hidden rounded-xl border-2 text-left transition', style === s.id ? 'border-royal shadow-lift' : 'border-gold/40 hover:border-gold')}>
                    <div className={cn('relative flex aspect-[4/3] items-center justify-center', `sw-${s.id}`)}><ImageIcon className="h-6 w-6 text-gold opacity-70" aria-hidden />{style === s.id && <CheckCircle2 className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-ivory text-royal" />}</div>
                    <p className="px-2 py-2 text-center text-xs font-semibold leading-tight">{s.label}</p>
                  </button>
                </li>
              ))}
            </ul>
          </Step>

          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <Step n={4} title="Output Format">
              <ul className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Aspect ratio">
                {ASPECT_RATIOS.map((r) => (
                  <li key={r}><button role="radio" aria-checked={ratio === r} onClick={() => setRatio(r)} className={cn('flex w-full flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-3 transition', ratio === r ? 'border-royal bg-royal/5' : 'border-gold/40 hover:border-gold')}>
                    <span className={cn('rounded-[3px] border-2 border-gold-deep', RATIO_BOX[r])} aria-hidden />
                    <span className="text-sm font-semibold">{r}</span><span className="text-[10px] text-ink-muted">{RATIO_LABEL[r]}</span>
                  </button></li>
                ))}
              </ul>
              <div className="mt-4"><Label htmlFor="cs-var">Variations</Label><Select id="cs-var" value={variations} onChange={(e) => setVariations(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</Select></div>
            </Step>
            <Step n={5} title="Art direction">
              <Label htmlFor="cs-notes">Notes for the creative brief (optional)</Label>
              <Textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1000))} placeholder="e.g. warm candlelight, soft bokeh, calm and premium" />
              <p className="mt-1 text-xs text-ink-muted">Style notes only. Never describe specifications — the brief forbids changing hallmarks, stones, metal or weight claims.</p>
              <Button size="lg" className="mt-4 w-full" disabled={!canMake || !productId || !mediaId} loading={!!running} onClick={() => generate.mutate()}>
                <Wand2 className="h-4 w-4" />Generate Creative Variations →
              </Button>
              {!productId && <p className="mt-2 text-center text-xs text-ink-muted">Select a product and an original image to continue.</p>}
            </Step>
          </div>

          <div ref={resultRef} className="scroll-mt-24">
            {job.isLoading && jobId && <Skeleton className="h-96" />}
            {job.data && ['QUEUED', 'RUNNING'].includes(job.data.status) && (
              <Panel className="flex items-center gap-4 p-6" role="status"><Loader2 className="h-6 w-6 animate-spin text-royal" aria-hidden /><div><p className="font-display font-semibold">Generating variations…</p><p className="text-sm text-ink-muted">Job is {job.data.status.toLowerCase()} · provider: {job.data.provider}</p></div></Panel>
            )}
            {job.data?.status === 'FAILED' && <Banner tone="error" title="Generation failed">{job.data.errorMessage ?? 'The provider reported an error.'} You can adjust the options and try again.</Banner>}
            {job.data?.status === 'COMPLETED' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold">Results &amp; Review</h2><ModeBadge simulated={job.data.simulated} /></div>
                <AssetReview assets={job.data.assets as ReviewAsset[]} sourceUrl={job.data.source.url} style={job.data.style} prompt={job.data.prompt} productName={job.data.productName} />
              </div>
            )}
          </div>

          {recent.data?.data.length > 0 && (
            <Panel>
              <div className="border-b border-gold/25 px-5 py-3"><h2 className="font-display text-base font-semibold">Recent jobs</h2></div>
              <ul className="divide-y divide-gold/20">{recent.data.data.slice(0, 6).map((j: any) => (
                <li key={j.id}><button onClick={() => { setJobId(j.id); setProductId(j.productId); }} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gold/10">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{j.productName}</span><span className="block text-xs text-ink-muted">{CREATIVE_STYLES.find((s) => s.id === j.style)?.label} · {j.aspectRatio} · {timeAgo(j.createdAt)}</span></span>
                  <span className="flex items-center gap-2">{j.simulated && <ModeBadge simulated />}<span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', j.status === 'COMPLETED' ? 'bg-status-approved/12 text-status-approved' : j.status === 'FAILED' ? 'bg-status-rejected/10 text-status-rejected' : 'bg-gold/20 text-gold-deep')}>{j.status}</span></span>
                </button></li>
              ))}</ul>
            </Panel>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3"><Label htmlFor="lib-f" className="!mb-0">Status</Label>
            <Select id="lib-f" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-52"><option value="">All</option><option value="DRAFT">Draft</option><option value="PENDING_REVIEW">Pending review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select></div>
          {assets.isLoading ? <Skeleton className="h-64" /> : assets.isError ? <QueryError error={assets.error} /> : !assets.data.data.length ? <EmptyState icon={Sparkles} title="No assets yet" description="Generate your first creative variations from the Create tab." /> : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{assets.data.data.map((a: any) => (
              <li key={a.id} className="panel overflow-hidden">
                <div className="aspect-[4/5] bg-maroon-deep"><img src={a.url} alt={`${a.productName} — ${a.style}`} loading="lazy" className="h-full w-full object-cover" /></div>
                <div className="space-y-2 p-3"><p className="truncate text-sm font-semibold">{a.productName}</p><div className="flex flex-wrap gap-1.5"><StatusPill status={a.reviewStatus} />{a.simulated && <ModeBadge simulated />}</div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setJobId(a.creativeJobId); setTab('create'); }}>Open in review</Button></div>
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function CreativeStudioPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Studio /></Suspense>;
}

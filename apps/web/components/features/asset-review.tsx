'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Textarea } from '@/components/ui/form';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { ModeBadge, StatusPill } from '@/components/ui/badge';
import { Banner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_APPROVE_ASSET, CAN_MAKE_CREATIVE, useAuth } from '@/lib/auth';
import { CREATIVE_STYLES } from '@techmunda/shared';
import { cn } from '@/lib/utils';

const CHECKLIST = ['Hallmark / engraving unchanged', 'Gemstone count and colours match the original', 'Metal colour and finish match', 'No weight, purity or price claims added'];

export interface ReviewAsset { id: string; url: string; reviewStatus: string; simulated: boolean; accuracyFlags: string[]; reviewNotes?: string | null; aspectRatio: string }

/** Original-versus-generated review (screen 5). Approving requires an explicit accuracy checklist. */
export function AssetReview({ assets, sourceUrl, style, prompt, productName, onChanged }: { assets: ReviewAsset[]; sourceUrl: string; style: string; prompt: string; productName?: string; onChanged?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [compare, setCompare] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [notes, setNotes] = useState('');
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => { if (idx >= assets.length) setIdx(0); }, [assets.length, idx]);
  const a = assets[idx];

  const done = () => { void qc.invalidateQueries({ queryKey: ['assets'] }); void qc.invalidateQueries({ queryKey: ['approvals'] }); void qc.invalidateQueries({ queryKey: ['job'] }); onChanged?.(); };
  const submit = useMutation({ mutationFn: () => api(`/creatives/assets/${a.id}/submit-review`, { method: 'POST' }), onSuccess: () => { toast.success('Submitted for human review.'); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  const approve = useMutation({ mutationFn: () => api(`/creatives/assets/${a.id}/approve`, { method: 'POST', body: { notes: notes || undefined, accuracyChecklistConfirmed: true } }), onSuccess: () => { toast.success('Asset approved.'); setApproving(false); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reject = useMutation({ mutationFn: () => api(`/creatives/assets/${a.id}/reject`, { method: 'POST', body: { notes: notes || undefined } }), onSuccess: () => { toast.success('Changes requested — asset rejected.'); setRejecting(false); setNotes(''); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  const exp = useMutation({ mutationFn: () => api<{ url: string }>(`/creatives/assets/${a.id}/export`), onSuccess: (r) => { window.open(r.url, '_blank', 'noopener'); }, onError: (e) => toast.error(errorMessage(e)) });

  if (!a) return null;
  const styleLabel = CREATIVE_STYLES.find((s) => s.id === style)?.label ?? style;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Generated Variations</h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            Compare
            <button type="button" role="switch" aria-checked={compare} onClick={() => setCompare(!compare)} className={cn('relative h-6 w-11 rounded-full border transition', compare ? 'border-royal bg-royal' : 'border-gold/60 bg-gold/20')}>
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-ivory shadow transition-all', compare ? 'left-[22px]' : 'left-0.5')} />
              <span className="sr-only">Compare with original</span>
            </button>
          </label>
        </div>
        <div className={cn('grid gap-3', compare ? 'sm:grid-cols-2' : 'grid-cols-1')}>
          {compare && (
            <figure className="relative overflow-hidden rounded-xl border border-gold/50 bg-maroon-deep">
              <img src={sourceUrl} alt={`Original photograph of ${productName ?? 'product'}`} className="aspect-[4/5] w-full object-contain" />
              <figcaption className="absolute bottom-2 left-2 rounded-md bg-maroon-deep/85 px-2.5 py-1 text-xs font-semibold text-ivory">Original</figcaption>
            </figure>
          )}
          <figure className="relative overflow-hidden rounded-xl border border-gold/50 bg-maroon-deep">
            <img src={a.url} alt={`${a.simulated ? 'Simulated' : 'AI-generated'} variation ${idx + 1}`} className="aspect-[4/5] w-full object-contain" />
            <figcaption className="absolute bottom-2 left-2 rounded-md bg-royal px-2.5 py-1 text-xs font-semibold text-ivory">{a.simulated ? 'Demo Simulation' : 'AI Generated'} — {styleLabel}</figcaption>
            {assets.length > 1 && (<>
              <button aria-label="Previous variation" onClick={() => setIdx((idx - 1 + assets.length) % assets.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-royal p-1.5 text-ivory shadow hover:bg-royal-hover"><ChevronLeft className="h-5 w-5" /></button>
              <button aria-label="Next variation" onClick={() => setIdx((idx + 1) % assets.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-royal p-1.5 text-ivory shadow hover:bg-royal-hover"><ChevronRight className="h-5 w-5" /></button>
            </>)}
          </figure>
        </div>
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 scroll-thin" aria-label="Variations">
          {assets.map((x, i) => (
            <li key={x.id}>
              <button onClick={() => setIdx(i)} aria-label={`Variation ${i + 1}, ${x.reviewStatus.replace('_', ' ').toLowerCase()}`} aria-current={i === idx} className={cn('block h-16 w-16 overflow-hidden rounded-lg border-2 bg-maroon-deep transition', i === idx ? 'border-royal' : 'border-gold/40 hover:border-gold')}>
                <img src={x.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <aside className="panel flex flex-col gap-4 p-5" aria-label="Asset details">
        <h3 className="font-display text-lg font-semibold">Asset Details</h3>
        <div className="flex flex-wrap items-center gap-2"><StatusPill status={a.reviewStatus} /><ModeBadge simulated={a.simulated} /></div>
        <div><p className="eyebrow !text-[10px]">Style</p><p className="text-sm font-medium">{styleLabel} · {a.aspectRatio}</p></div>
        <div><p className="eyebrow !text-[10px]">Prompt (provenance)</p><p className="mt-0.5 max-h-28 overflow-y-auto rounded-lg border border-gold/30 bg-cream/70 p-2.5 text-xs leading-relaxed scroll-thin">{prompt}</p></div>
        <div>
          <p className="eyebrow !text-[10px]">Accuracy flags</p>
          <ul className="mt-1 space-y-1.5">{a.accuracyFlags.map((f) => <li key={f} className="flex gap-2 text-xs"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending" aria-hidden />{f}</li>)}</ul>
        </div>
        {a.reviewNotes && <p className="rounded-lg bg-gold/10 p-2.5 text-xs"><strong>Reviewer notes:</strong> {a.reviewNotes}</p>}
        <div className="mt-auto space-y-2">
          {['DRAFT', 'REJECTED'].includes(a.reviewStatus) && can(...CAN_MAKE_CREATIVE) && <Button className="w-full" onClick={() => submit.mutate()} loading={submit.isPending}>Submit for Review</Button>}
          {a.reviewStatus === 'PENDING_REVIEW' && (can(...CAN_APPROVE_ASSET) ? (<>
            <Button className="w-full" onClick={() => { setTicks(CHECKLIST.map(() => false)); setNotes(''); setApproving(true); }}>Approve Asset →</Button>
            <Button variant="outline" className="w-full" onClick={() => { setNotes(''); setRejecting(true); }}>Request Changes</Button>
          </>) : <Banner tone="info">Waiting for an authorised reviewer.</Banner>)}
          {a.reviewStatus === 'APPROVED' && <Button variant="gold" className="w-full" onClick={() => exp.mutate()} loading={exp.isPending}><Download className="h-4 w-4" />Export approved asset</Button>}
          {a.reviewStatus !== 'APPROVED' && <p className="text-center text-[11px] text-ink-muted">Only approved assets can be exported or attached to campaigns.</p>}
        </div>
      </aside>

      <Dialog open={approving} onOpenChange={setApproving}>
        <DialogContent title="Confirm product accuracy" description="AI image editing cannot guarantee that every physical detail is preserved. Compare against the original before approving.">
          <ul className="space-y-2.5">{CHECKLIST.map((c, i) => <li key={c}><label className="flex cursor-pointer items-start gap-2.5 text-sm"><Checkbox checked={ticks[i]} onChange={(e) => setTicks(ticks.map((t, j) => (j === i ? e.target.checked : t)))} />{c}</label></li>)}</ul>
          <Textarea className="mt-4" placeholder="Reviewer notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Reviewer notes" />
          <div className="mt-4 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled={!ticks.every(Boolean)} loading={approve.isPending} onClick={() => approve.mutate()}>Approve asset</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent title="Request changes" description="The asset will be marked rejected and cannot be exported.">
          <Textarea placeholder="What should change?" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Requested changes" />
          <div className="mt-4 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>Reject asset</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

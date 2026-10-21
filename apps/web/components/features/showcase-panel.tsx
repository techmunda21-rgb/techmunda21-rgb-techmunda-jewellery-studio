'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Presentation, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Banner } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, uploadShowcasePdf } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateOnly } from '@/lib/format';
import { Motif } from '@/components/brand/brand';

/** Dashboard "Showcase": the active design PDF (lookbook / price catalogue) embedded for client presentations. */
export function ShowcasePanel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [manage, setManage] = useState(false);
  const [inlinePdf, setInlinePdf] = useState(false);
  useEffect(() => { setInlinePdf(window.matchMedia('(min-width: 640px)').matches && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false); }, []);
  const list = useQuery({ queryKey: ['showcase'], queryFn: () => api<{ data: any[] }>('/showcase') });
  const writer = can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER');
  const remover = can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER');
  const active = list.data?.data.find((d) => d.isActive);
  const refresh = () => qc.invalidateQueries({ queryKey: ['showcase'] });

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (input.current) input.current.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return toast.error('Please choose a PDF file.');
    if (f.size > 25 * 1024 * 1024) return toast.error('That PDF is larger than 25 MB.');
    try {
      setProgress(0);
      await uploadShowcasePdf(f, f.name.replace(/\.pdf$/i, '').slice(0, 120), setProgress);
      toast.success('Design PDF added to the dashboard showcase.');
      await refresh();
    } catch (e) { toast.error(errorMessage(e)); } finally { setProgress(null); }
  }
  const activate = useMutation({ mutationFn: (id: string) => api(`/showcase/${id}/activate`, { method: 'POST' }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const del = useMutation({ mutationFn: (id: string) => api(`/showcase/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Deleted.'); void refresh(); }, onError: (e) => toast.error(errorMessage(e)) });

  const uploadBtn = writer && (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose design PDF" onChange={(e) => void pick(e.target.files)} />
      <Button variant={active ? 'onDark' : 'primary'} size="sm" loading={progress !== null} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{progress !== null ? `Uploading ${progress}%` : active ? 'Replace PDF' : 'Import design PDF'}</Button>
    </>
  );

  return (
    <section aria-labelledby="showcase-h" className="relative overflow-hidden rounded-2xl border border-gold/60 bg-maroon text-maroon-foreground shadow-lift">
      <Motif className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 opacity-15" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/70 bg-gold/10 text-gold"><Presentation className="h-5 w-5" aria-hidden /></span>
          <div>
            <p className="eyebrow !text-gold">Showcase</p>
            <h2 id="showcase-h" className="font-display text-xl font-semibold !text-ivory">{active ? active.title : 'Present your designs'}</h2>
            {active && <p className="text-xs text-maroon-foreground/70">{active.pageCount} pages · added {dateOnly(active.createdAt)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active && <Button asChild variant="gold" size="sm"><a href={active.url} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" />Open full screen</a></Button>}
          {(list.data?.data.length ?? 0) > 1 && <Button variant="onDark" size="sm" onClick={() => setManage(true)}><FileText className="h-4 w-4" />All PDFs ({list.data!.data.length})</Button>}
          {uploadBtn}
        </div>
      </div>
      <div className="relative border-t border-gold/40 bg-ivory">
        {list.isLoading ? <Skeleton className="h-72 rounded-none" /> : active ? (
          <>
            {inlinePdf ? (
              <object data={`${active.url}#view=FitH&navpanes=0`} type="application/pdf" aria-label={`${active.title} PDF`} className="h-[560px] w-full">
                <div className="p-8 text-center"><Button asChild><a href={active.url} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" />Open {active.title}</a></Button></div>
              </object>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center"><FileText className="h-10 w-10 text-gold-deep" aria-hidden /><p className="font-display text-lg font-semibold">{active.title}</p><p className="text-sm text-ink-muted">{active.pageCount} pages · this device opens PDFs in its own viewer.</p><Button asChild><a href={active.url} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" />Open PDF</a></Button></div>
            )}
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-lg font-semibold text-ink">No design PDF yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{writer ? 'Import a lookbook or price-catalogue PDF (up to 25 MB, 200 pages). It will be shown here for clients.' : 'An owner, manager or designer can import a design PDF to showcase here.'}</p>
          </div>
        )}
      </div>
      <Dialog open={manage} onOpenChange={setManage}>
        <DialogContent title="Showcase PDFs" description="Choose which PDF the dashboard shows.">
          <ul className="divide-y divide-gold/25 rounded-xl border border-gold/40">
            {list.data?.data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.title}</p><p className="text-xs text-ink-muted">{d.pageCount} pages · {dateOnly(d.createdAt)} · {(d.fileSize / 1048576).toFixed(1)} MB</p></div>
                {d.isActive ? <Pill tone="green">On dashboard</Pill> : writer && <Button size="sm" variant="outline" onClick={() => activate.mutate(d.id)}>Show</Button>}
                {remover && <Button size="icon" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => confirm(`Delete “${d.title}”?`) && del.mutate(d.id)}><Trash2 className="h-4 w-4 text-status-rejected" /></Button>}
              </li>
            ))}
          </ul>
          <Banner className="mt-4">PDFs containing scripts, launch actions or embedded files are refused for safety.</Banner>
          <div className="mt-4 flex justify-end"><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

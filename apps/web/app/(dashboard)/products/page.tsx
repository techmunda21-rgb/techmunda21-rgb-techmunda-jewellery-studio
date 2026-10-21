'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileUp, Filter, MoreVertical, Package, Plus, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { PURITY_OPTIONS, metalFamily, productFieldsSchema, purityError } from '@techmunda/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/card';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { SpinViewer } from '@/components/features/spin-viewer';
import { cn } from '@/lib/utils';
import { EmptyState, QueryError, Banner } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/ui/badge';
import { Dropzone } from '@/components/features/dropzone';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, uploadProductImage } from '@/lib/api';
import { CAN_MAKE_CREATIVE, useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

const CATEGORIES = ['Necklace', 'Bangles', 'Bridal Set', 'Earrings', 'Ring', 'Mangalsutra', 'Pendant', 'Bracelet', 'Anklet', 'Other'];
const formSchema = productFieldsSchema.extend({ weight: z.union([z.coerce.number().positive('Weight must be greater than 0'), z.literal('').transform(() => null)]).nullish(), price: z.union([z.coerce.number().nonnegative(), z.literal('').transform(() => null)]).nullish() }).superRefine((v, ctx) => { const e = purityError(v.metalType, v.purity); if (e) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purity'], message: e }); });
type FormValues = z.input<typeof formSchema>;

function ProductForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { currency: me?.tenant.currency ?? 'INR', availability: 'IN_STOCK', category: 'Necklace' } });
  const create = useMutation({
    mutationFn: (v: unknown) => api('/products', { method: 'POST', body: v }),
    onSuccess: () => { toast.success('Product added to the catalogue.'); void qc.invalidateQueries({ queryKey: ['products'] }); onDone(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => create.mutate(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined))))}>
      <Field label="Product name" htmlFor="p-name" error={errors.name?.message} required><Input id="p-name" {...register('name')} placeholder="Diamond Necklace" /></Field>
      <Field label="SKU" htmlFor="p-sku" error={errors.sku?.message} required hint="Unique within your catalogue"><Input id="p-sku" {...register('sku')} placeholder="DN-001" /></Field>
      <Field label="Category" htmlFor="p-cat" error={errors.category?.message} required><Select id="p-cat" {...register('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Availability" htmlFor="p-av"><Select id="p-av" {...register('availability')}><option value="IN_STOCK">In stock</option><option value="MADE_TO_ORDER">Made to order</option><option value="OUT_OF_STOCK">Out of stock</option></Select></Field>
      <Field label="Metal" htmlFor="p-metal"><Select id="p-metal" {...register('metalType')} defaultValue=""><option value="">Select metal</option><option>Gold</option><option>Platinum</option><option>Silver</option><option>Other</option></Select></Field>
      <Field label="Purity (hallmark)" htmlFor="p-purity" error={errors.purity?.message} hint="From the hallmark record, e.g. 22K / 916"><Input id="p-purity" list="purity-list" {...register('purity')} placeholder="22K" /><datalist id="purity-list">{(PURITY_OPTIONS[metalFamily(watch('metalType')) as 'gold'] ?? PURITY_OPTIONS.gold).map((p) => <option key={p.label} value={p.label}>{p.fineness}</option>)}</datalist></Field>
      <Field label="Stones" htmlFor="p-stone"><Input id="p-stone" {...register('stoneType')} placeholder="Diamond" /></Field>
      <Field label="Gross weight (g)" htmlFor="p-weight" error={errors.weight?.message as string} hint="From the weighing record"><Input id="p-weight" inputMode="decimal" {...register('weight')} /></Field>
      <Field label="Price" htmlFor="p-price" error={errors.price?.message as string}><Input id="p-price" inputMode="decimal" {...register('price')} /></Field>
      <Field label="Currency" htmlFor="p-cur" error={errors.currency?.message}><Input id="p-cur" maxLength={3} {...register('currency')} /></Field>
      <Field label="Description" htmlFor="p-desc" className="sm:col-span-2"><Textarea id="p-desc" {...register('description')} /></Field>
      <Banner className="sm:col-span-2">Specifications are entered by your team. The AI never invents or alters metal, purity, stone or weight details.</Banner>
      <div className="flex justify-end gap-2 sm:col-span-2"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" loading={create.isPending}>Add Product</Button></div>
    </form>
  );
}

function SpinManager({ product, onChanged }: { product: any; onChanged: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const frames: any[] = product.media.filter((m: any) => m.mediaKind === 'SPIN_FRAME');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const writer = can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER');

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (list.length > 72) return toast.error('Use at most 72 frames (36 is plenty).');
    try {
      for (let k = 0; k < list.length; k++) {
        setBusy(`Uploading frame ${k + 1} of ${list.length}…`);
        await uploadProductImage(product.id, list[k], undefined, { kind: 'SPIN_FRAME', sortOrder: frames.length + k });
      }
      toast.success(`${list.length} frame(s) added.`);
      onChanged();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  async function clear() {
    if (!confirm('Delete all 360° frames for this product?')) return;
    try { for (const f of frames) await api(`/media/${f.id}`, { method: 'DELETE' }); toast.success('Frames deleted.'); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  return (
    <div className="space-y-4">
      {frames.length >= 8 ? <SpinViewer frames={frames.map((f) => f.url)} alt={product.name} /> : (
        <Banner tone={frames.length ? 'warn' : 'info'} title={frames.length ? `Only ${frames.length} frame(s) — a smooth 360° view needs at least 8 (24–36 recommended)` : 'No 360° view yet'}>
          Photograph the piece on a turntable at equal angle steps (e.g. every 10° → 36 photos), same framing and lighting, name the files in order (<code>01.jpg … 36.jpg</code>) and upload them together. The viewer only shows real photographs — it never invents angles.
        </Banner>
      )}
      {writer && (
        <div className="rounded-xl border border-gold/40 bg-cream/60 p-4">
          <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-[13px]"><Checkbox checked={rights} onChange={(e) => setRights(e.target.checked)} />I confirm these photographs belong to the client or I am authorised to use them.</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className={rights && !busy ? 'cursor-pointer' : 'pointer-events-none opacity-55'}>
              <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold bg-gold/15 px-4 text-sm font-semibold text-gold-deep hover:bg-gold/25"><Upload className="h-4 w-4" />Add turntable frames</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!rights || !!busy} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
            </label>
            {frames.length > 0 && <Button variant="danger" size="sm" onClick={clear} disabled={!!busy}><Trash2 className="h-4 w-4" />Delete all frames</Button>}
            {busy && <span role="status" className="text-sm text-ink-muted">{busy}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState<'photos' | 'spin'>('photos');
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api<any>(`/products/${id}`) });
  const del = useMutation({ mutationFn: () => api(`/products/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Product deleted.'); void qc.invalidateQueries({ queryKey: ['products'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
  const p = q.data;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['product', id] }); void qc.invalidateQueries({ queryKey: ['products'] }); };
  const photos = p?.media.filter((m: any) => m.mediaKind === 'PHOTO') ?? [];
  return (
    <div className="space-y-5">
      {q.isLoading || !p ? <Skeleton className="h-48" /> : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[['SKU', p.sku], ['Category', p.category], ['Price', money(p.price, p.currency)], ['Metal', p.metalType ?? '—'], ['Purity (hallmark)', p.purityLabel ? `${p.purityLabel}${p.fineness ? ` · ${p.fineness}` : ''}` : '—'], ['Stones', p.stoneType ?? '—'], ['Gross weight', p.weight ? `${p.weight} g` : '—'], ['Pure metal content', p.pureMetalGrams != null ? `${p.pureMetalGrams} g` : '—'], ['Availability', p.availability.replace(/_/g, ' ').toLowerCase()]].map(([k, v]) => (
              <div key={k}><dt className="eyebrow !text-[10px]">{k}</dt><dd className="mt-0.5 font-medium capitalize">{v}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-ink-muted">Purity and weight come from the team’s hallmark and weighing records. Pure metal content = gross weight × fineness ÷ 1000 (stone and other material weight is not deducted).</p>
          <div role="tablist" className="flex gap-1 border-b border-gold/30">
            {([['photos', `Photos (${photos.length})`], ['spin', `360° view (${p.media.length - photos.length})`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-semibold', tab === k ? 'border-royal text-royal' : 'border-transparent text-ink-muted hover:text-ink')}>{l}</button>)}
          </div>
          {tab === 'photos' ? (
            <div>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((m: any) => (<div key={m.id} className="aspect-square overflow-hidden rounded-lg border border-gold/40 bg-cream"><img src={m.url} alt={`${p.name} original`} className="h-full w-full object-cover" /></div>))}
                {!photos.length && <p className="col-span-full text-sm text-ink-muted">No images yet.</p>}
              </div>
              {can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER') && <Dropzone productId={id} compact onUploaded={refresh} />}
            </div>
          ) : <SpinManager product={p} onChanged={refresh} />}
          <div className="flex flex-wrap justify-between gap-2 border-t border-gold/25 pt-4">
            {can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER') ? <Button variant="danger" size="sm" loading={del.isPending} onClick={() => confirm(`Delete ${p.name} and all its images?`) && del.mutate()}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
            {can(...CAN_MAKE_CREATIVE) && <Button asChild size="sm"><Link href={`/creative-studio?productId=${id}`}><Sparkles className="h-4 w-4" />Create visuals</Link></Button>}
          </div>
        </>
      )}
    </div>
  );
}

const TEMPLATE = 'sku,name,category,metal,purity,stones,weight_g,price,currency,availability,description\nNK-001,Emerald Heritage Necklace,Necklace,Gold,22K,"Emerald, Diamond",78.5,485000,INR,IN_STOCK,Heritage choker set\nRG-012,Solitaire Diamond Ring,Ring,Gold,18K,Diamond,5.8,235000,INR,IN_STOCK,\n';

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [update, setUpdate] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const prev = useMutation({ mutationFn: () => api<any>('/products/import/preview', { method: 'POST', body: { csv } }), onSuccess: setPreview, onError: (e) => toast.error(errorMessage(e)) });
  const commit = useMutation({
    mutationFn: () => api<any>('/products/import/commit', { method: 'POST', body: { updateExisting: update, rows: preview.rows.filter((r: any) => r.importable && (update || !r.duplicate)).map(({ sku, name, category, description, metalType, purity, stoneType, weight, price, currency, availability }: any) => ({ sku, name, category, description, metalType, purity, stoneType, weight, price, currency, availability })) } }),
    onSuccess: (r) => { toast.success(`${r.created} added, ${r.updated} updated, ${r.skipped} skipped.`); void qc.invalidateQueries({ queryKey: ['products'] }); setPreview(null); setCsv(''); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'catalogue-template.csv'; a.click(); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPreview(null); }}>
      <DialogContent wide title="Import catalogue (CSV)" description="Prices, hallmark purity and gross weight are checked before anything is saved.">
        {!preview ? (<>
          <div className="mb-3 flex flex-wrap items-center gap-2"><input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" className="text-sm file:mr-3 file:rounded-lg file:border file:border-gold file:bg-gold/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} /><Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" />Template</Button></div>
          <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={TEMPLATE} className="min-h-[170px] font-mono text-xs" aria-label="CSV contents" />
          <p className="mt-1 text-xs text-ink-muted">Required: sku, name, category. Gold purity must be a real standard (24K/916…, 22K/916, 21K, 18K/750, 14K/585, 9K/375).</p>
          <div className="mt-4 flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button disabled={!csv.trim()} loading={prev.isPending} onClick={() => prev.mutate()}>Preview import</Button></div>
        </>) : (<>
          <div className="mb-3 flex flex-wrap gap-2"><Pill tone="green">{preview.summary.importable} new</Pill><Pill tone="gold">{preview.summary.updatable} existing SKUs</Pill><Pill tone="red">{preview.summary.invalid} with problems</Pill></div>
          <div className="max-h-72 overflow-auto rounded-xl border border-gold/40"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-cream"><tr>{['Row', 'SKU / name', 'Purity', 'Gross g', 'Pure g', 'Price', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{preview.rows.map((r: any) => (<tr key={r.row} className="border-t border-gold/20"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2"><span className="font-medium">{r.sku}</span><br />{r.name}</td><td className="px-3 py-2">{r.purityLabel ?? '—'}{r.fineness ? ` · ${r.fineness}` : ''}</td><td className="px-3 py-2">{r.weight ?? '—'}</td><td className="px-3 py-2">{r.pureMetalGrams ?? '—'}</td><td className="px-3 py-2">{r.price != null ? money(r.price, r.currency) : '—'}</td>
              <td className="px-3 py-2">{r.problems.length ? <Pill tone="red">{r.problems[0]}</Pill> : r.duplicate === 'file' ? <Pill tone="red">Duplicate in file</Pill> : r.duplicate ? <Pill tone="gold">Exists</Pill> : <Pill tone="green">New</Pill>}</td></tr>))}</tbody></table></div>
          {preview.summary.updatable > 0 && <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={update} onChange={(e) => setUpdate(e.target.checked)} className="!mt-0" />Overwrite the {preview.summary.updatable} existing product(s) with these values</label>}
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Back</Button><Button disabled={!preview.summary.importable && !(update && preview.summary.updatable)} loading={commit.isPending} onClick={() => commit.mutate()}>Import</Button></div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['products', q, category, page], queryFn: () => api<any>('/products', { query: { q, category, page, pageSize: 12 } }), placeholderData: (p) => p });

  return (
    <div>
      <PageHeader title="Products" description="Manage your jewellery catalogue and create marketing assets." actions={can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER') && <><Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import CSV</Button><Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add Product</Button></>} />
      <Panel className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-deep" aria-hidden />
          <input aria-label="Search products" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search products, SKU, category…" className="field pl-9" />
        </div>
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-gold-deep" aria-hidden />
          <Select aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-44"><option value="">All Categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </div>
      </Panel>

      {list.isError ? <QueryError error={list.error} retry={() => list.refetch()} /> : list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : !list.data.data.length ? (
        <EmptyState icon={Package} title="No products found" description={q || category ? 'Try a different search or filter.' : 'Add your first product to start creating marketing visuals.'} action={can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER') && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add Product</Button>} />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.data.data.map((p: any) => (
              <li key={p.id}>
                <button onClick={() => setOpen(p.id)} className="group w-full overflow-hidden rounded-2xl border border-gold/45 bg-ivory text-left shadow-card transition hover:-translate-y-0.5 hover:border-gold hover:shadow-lift" aria-label={`Open ${p.name}`}>
                  <div className="relative aspect-square overflow-hidden border-b border-gold/30 bg-maroon/90">
                    {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-gold/70"><Package className="h-10 w-10" /></div>}
                    {p.availability !== 'IN_STOCK' && <span className="absolute left-2 top-2"><Pill tone={p.availability === 'OUT_OF_STOCK' ? 'red' : 'gold'}>{p.availability === 'OUT_OF_STOCK' ? 'Out of stock' : 'Made to order'}</Pill></span>}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2"><h3 className="font-display text-[15px] font-semibold leading-snug">{p.name}</h3><MoreVertical className="h-4 w-4 shrink-0 text-gold-deep" aria-hidden /></div>
                    <p className="mt-1 text-xs text-ink-muted">SKU: {p.sku} · {p.category}</p>
                    {(p.purityLabel || p.weight) && <p className="mt-1 text-xs font-medium text-gold-deep">{[p.purityLabel && `${p.purityLabel}${p.fineness ? ` · ${p.fineness}` : ''}`, p.weight && `${p.weight} g`].filter(Boolean).join(' · ')}</p>}
                    <p className="mt-2 font-display text-lg font-semibold text-royal">{money(p.price, p.currency)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {list.data.meta.totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-ink-muted">Page {page} of {list.data.meta.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>
          )}
        </>
      )}

      <ImportDialog open={importing} onOpenChange={setImporting} />
      <Dialog open={adding} onOpenChange={setAdding}><DialogContent wide title="Add product" description="Create a catalogue entry. You can upload photographs after saving."><ProductForm onDone={() => setAdding(false)} /></DialogContent></Dialog>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}><DialogContent wide title="Product details">{open && <ProductDetail id={open} onClose={() => setOpen(null)} />}</DialogContent></Dialog>
    </div>
  );
}

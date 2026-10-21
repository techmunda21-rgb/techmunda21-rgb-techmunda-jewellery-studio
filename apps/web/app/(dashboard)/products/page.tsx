'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Filter, MoreVertical, Package, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { productInputSchema } from '@techmunda/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/card';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, QueryError, Banner } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/ui/badge';
import { Dropzone } from '@/components/features/dropzone';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { CAN_MAKE_CREATIVE, useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

const CATEGORIES = ['Necklace', 'Bangles', 'Bridal Set', 'Earrings', 'Ring', 'Mangalsutra', 'Pendant', 'Bracelet', 'Anklet', 'Other'];
const formSchema = productInputSchema.extend({ weight: z.union([z.coerce.number().nonnegative(), z.literal('').transform(() => null)]).nullish(), price: z.union([z.coerce.number().nonnegative(), z.literal('').transform(() => null)]).nullish() });
type FormValues = z.input<typeof formSchema>;

function ProductForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { currency: me?.tenant.currency ?? 'INR', availability: 'IN_STOCK', category: 'Necklace' } });
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
      <Field label="Metal" htmlFor="p-metal"><Input id="p-metal" {...register('metalType')} placeholder="Gold" /></Field>
      <Field label="Purity" htmlFor="p-purity"><Input id="p-purity" {...register('purity')} placeholder="22K" /></Field>
      <Field label="Stones" htmlFor="p-stone"><Input id="p-stone" {...register('stoneType')} placeholder="Diamond" /></Field>
      <Field label="Weight (g)" htmlFor="p-weight" error={errors.weight?.message as string}><Input id="p-weight" inputMode="decimal" {...register('weight')} /></Field>
      <Field label="Price" htmlFor="p-price" error={errors.price?.message as string}><Input id="p-price" inputMode="decimal" {...register('price')} /></Field>
      <Field label="Currency" htmlFor="p-cur" error={errors.currency?.message}><Input id="p-cur" maxLength={3} {...register('currency')} /></Field>
      <Field label="Description" htmlFor="p-desc" className="sm:col-span-2"><Textarea id="p-desc" {...register('description')} /></Field>
      <Banner className="sm:col-span-2">Specifications are entered by your team. The AI never invents or alters metal, purity, stone or weight details.</Banner>
      <div className="flex justify-end gap-2 sm:col-span-2"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="submit" loading={create.isPending}>Add Product</Button></div>
    </form>
  );
}

function ProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api<any>(`/products/${id}`) });
  const del = useMutation({ mutationFn: () => api(`/products/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Product deleted.'); void qc.invalidateQueries({ queryKey: ['products'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
  const p = q.data;
  return (
    <div className="space-y-5">
      {q.isLoading || !p ? <Skeleton className="h-48" /> : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[['SKU', p.sku], ['Category', p.category], ['Price', money(p.price, p.currency)], ['Metal', p.metalType ?? '—'], ['Purity', p.purity ?? '—'], ['Stones', p.stoneType ?? '—'], ['Weight', p.weight ? `${p.weight} g` : '—'], ['Availability', p.availability.replace(/_/g, ' ').toLowerCase()]].map(([k, v]) => (
              <div key={k}><dt className="eyebrow !text-[10px]">{k}</dt><dd className="mt-0.5 font-medium capitalize">{v}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="mb-2 font-display text-base font-semibold">Images ({p.media.length})</h3>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {p.media.map((m: any) => (<div key={m.id} className="aspect-square overflow-hidden rounded-lg border border-gold/40 bg-cream"><img src={m.url} alt={`${p.name} original`} className="h-full w-full object-cover" /></div>))}
              {!p.media.length && <p className="col-span-full text-sm text-ink-muted">No images yet.</p>}
            </div>
            {can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER') && <Dropzone productId={id} compact onUploaded={() => { void qc.invalidateQueries({ queryKey: ['product', id] }); void qc.invalidateQueries({ queryKey: ['products'] }); }} />}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-gold/25 pt-4">
            {can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER') ? <Button variant="danger" size="sm" loading={del.isPending} onClick={() => confirm(`Delete ${p.name} and all its images?`) && del.mutate()}><Trash2 className="h-4 w-4" />Delete</Button> : <span />}
            {can(...CAN_MAKE_CREATIVE) && <Button asChild size="sm"><Link href={`/creative-studio?productId=${id}`}><Sparkles className="h-4 w-4" />Create visuals</Link></Button>}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['products', q, category, page], queryFn: () => api<any>('/products', { query: { q, category, page, pageSize: 12 } }), placeholderData: (p) => p });

  return (
    <div>
      <PageHeader title="Products" description="Manage your jewellery catalogue and create marketing assets." actions={can('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER') && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add Product</Button>} />
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

      <Dialog open={adding} onOpenChange={setAdding}><DialogContent wide title="Add product" description="Create a catalogue entry. You can upload photographs after saving."><ProductForm onDone={() => setAdding(false)} /></DialogContent></Dialog>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}><DialogContent wide title="Product details">{open && <ProductDetail id={open} onClose={() => setOpen(null)} />}</DialogContent></Dialog>
    </div>
  );
}

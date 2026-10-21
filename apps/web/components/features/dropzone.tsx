'use client';
import { useRef, useState } from 'react';
import { CloudUpload, ShieldCheck } from 'lucide-react';
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES } from '@techmunda/shared';
import { uploadProductImage, errorMessage } from '@/lib/api';
import { Checkbox } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/** Drag-and-drop uploader. The user must confirm the image is client-authorised BEFORE anything is sent. */
export function Dropzone({ productId, disabled, onUploaded, compact }: { productId?: string; disabled?: boolean; onUploaded: (media: any) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const blocked = disabled || !productId;

  async function handle(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) return setError('Only JPG, PNG or WebP images are accepted.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('That file is larger than 10 MB.');
    if (!rights) return setError('Please confirm you are authorised to use this image.');
    try {
      setProgress(0);
      const media = await uploadProductImage(productId!, file, setProgress);
      toast.success('Image uploaded and validated.');
      onUploaded(media);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked}
        aria-label="Upload a product photograph. Drag and drop or press Enter to browse."
        onClick={() => !blocked && rights && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !blocked && rights && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); if (!blocked) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!blocked) void handle(e.dataTransfer.files); }}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition',
          compact ? 'py-6' : 'py-10',
          drag ? 'border-royal bg-royal/5' : 'border-gold/60 bg-gold/5',
          blocked || !rights ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-gold/10',
        )}
      >
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-gold bg-ivory text-royal"><CloudUpload className="h-5 w-5" aria-hidden /></span>
        <p className="text-sm font-semibold">Drag &amp; drop your image here</p>
        <p className="text-xs text-ink-muted">or click to browse · JPG, PNG, WebP up to 10 MB</p>
        {progress !== null && (
          <div className="mt-3 w-full max-w-xs" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-2 overflow-hidden rounded-full bg-gold/25"><div className="h-full rounded-full bg-royal transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-1 text-xs text-ink-muted">{progress < 100 ? 'Uploading…' : 'Validating image…'}</p>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept={ALLOWED_IMAGE_MIME.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => void handle(e.target.files)} aria-hidden />
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px]">
        <Checkbox checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <span><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-gold-deep" aria-hidden />I confirm this photograph belongs to the client or I am authorised to use it for marketing. <span className="text-ink-muted">Required before upload.</span></span>
      </label>
      {!productId && <p className="mt-2 text-xs text-ink-muted">Select a product first.</p>}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-status-rejected">{error}</p>}
    </div>
  );
}

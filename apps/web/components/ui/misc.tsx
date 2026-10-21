import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gold/50 bg-ivory/60 px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold-deep"><Icon className="h-6 w-6" aria-hidden /></span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'error'; title?: string; children?: React.ReactNode; className?: string }) {
  const t = { info: 'border-gold/55 bg-gold/10', warn: 'border-status-pending/55 bg-status-pending/10', error: 'border-status-rejected/55 bg-status-rejected/10' }[tone];
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-3.5 text-sm', t, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'info' ? 'text-gold-deep' : tone === 'warn' ? 'text-status-pending' : 'text-status-rejected')} aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}{children && <div className={cn(title && 'mt-0.5 text-ink-muted')}>{children}</div>}</div>
    </div>
  );
}

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Banner tone="error" title="Could not load this data">
      <span>{error instanceof Error ? error.message : 'Unexpected error'}</span>
      {retry && <button onClick={retry} className="ml-2 font-semibold text-royal underline underline-offset-2">Retry</button>}
    </Banner>
  );
}

export const CardSkeletonGrid = ({ n = 4, h = 'h-40' }: { n?: number; h?: string }) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className={h} />)}</div>
);

export const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/60 bg-maroon text-[11px] font-semibold text-maroon-foreground', className)} aria-hidden>
    {name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
  </span>
);

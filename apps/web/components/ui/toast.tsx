'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast { id: number; kind: 'success' | 'error'; message: string }
const Ctx = createContext<{ success(m: string): void; error(m: string): void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, kind, message }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={{ success: (m) => push('success', m), error: (m) => push('error', m) }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="region" aria-live="polite" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto flex items-start gap-3 rounded-xl border bg-ivory p-3 text-sm shadow-lift animate-fade-up', t.kind === 'error' ? 'border-status-rejected/50' : 'border-status-approved/50')}>
            {t.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-rejected" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-approved" />}
            <p className="flex-1">{t.message}</p>
            <button onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="text-ink-muted hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside provider');
  return c;
};

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckSquare, Gem, KanbanSquare, LayoutDashboard, Megaphone, Package, Settings, Sparkles, Users } from 'lucide-react';
import { Logo, Motif } from '@/components/brand/brand';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/creative-studio', label: 'Creative Studio', icon: Sparkles },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/crm', label: 'CRM', icon: KanbanSquare },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const pending = useQuery({ queryKey: ['approvals', 'PENDING_REVIEW'], queryFn: () => api<{ data: unknown[] }>('/approvals'), refetchInterval: 30_000 });
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => api<any>('/ai/status'), staleTime: 60_000 });
  const count = pending.data?.data.length ?? 0;
  const simulated = ai.data?.text?.mode === 'SIMULATED';

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-maroon text-maroon-foreground">
      <Motif className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 opacity-15" />
      <div className="relative px-5 pb-5 pt-6"><Logo /></div>
      <nav aria-label="Primary" className="relative flex-1 space-y-1 overflow-y-auto px-3 scroll-thin">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                active ? 'border-gold/70 bg-gold/20 text-ivory shadow-[inset_0_0_0_1px_rgb(var(--gold)/0.2)]' : 'border-transparent text-maroon-foreground/80 hover:border-gold/30 hover:bg-gold/10 hover:text-ivory',
              )}
            >
              <Icon className="h-[18px] w-[18px] text-gold" aria-hidden />
              <span className="flex-1">{label}</span>
              {href === '/approvals' && count > 0 && <span className="rounded-full bg-royal px-2 py-0.5 text-[11px] font-semibold text-ivory ring-1 ring-gold/60" aria-label={`${count} pending`}>{count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="relative m-3 rounded-xl border border-gold/35 bg-maroon-deep/60 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-ivory"><Gem className="h-3.5 w-3.5 text-gold" aria-hidden />AI mode</div>
        <p className="mt-1 text-maroon-foreground/75">{ai.isLoading ? 'Checking…' : simulated ? 'Demo simulation — no AI provider key configured.' : 'Live AI provider connected.'}</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gold/30 lg:block">
      <SidebarContent />
    </aside>
  );
}

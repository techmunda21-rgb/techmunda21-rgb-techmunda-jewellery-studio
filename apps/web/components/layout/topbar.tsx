'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, Menu, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { Avatar } from '@/components/ui/misc';
import { SidebarContent } from './sidebar';
import { Logo } from '@/components/brand/brand';

export function Topbar() {
  const { me, signOut } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const notifs = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ data: any[] }>('/notifications'), refetchInterval: 45_000 });
  const qc = useQueryClient();
  void useMutation;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (setMenu(null), setDrawer(false));
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, []);

  const unread = notifs.data?.data.filter((n) => !n.readAt).length ?? 0;

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gold/30 bg-cream/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 text-ink hover:bg-gold/15 lg:hidden" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu className="h-5 w-5" /></button>
        <form
          role="search"
          className="relative hidden max-w-md flex-1 sm:block"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/leads?q=${encodeURIComponent(q.trim())}`); }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-deep" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" placeholder="Search leads, contacts, products…" className="field pl-9" />
        </form>
        <div className="flex-1 sm:hidden"><Logo tone="dark" subtitle={false} className="[&_svg]:h-7 [&_svg]:w-7 [&_p]:text-xl" /></div>
        <div className="ml-auto flex items-center gap-1.5" ref={ref}>
          <div className="relative">
            <button className="relative rounded-lg p-2 text-ink hover:bg-gold/15" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={menu === 'bell'} onClick={() => setMenu(menu === 'bell' ? null : 'bell')}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-royal ring-2 ring-cream" />}
            </button>
            {menu === 'bell' && (
              <div className="absolute right-0 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-gold/50 bg-ivory shadow-lift">
                <p className="border-b border-gold/25 px-4 py-2.5 font-display font-semibold">Notifications</p>
                <ul className="max-h-80 overflow-y-auto scroll-thin">
                  {notifs.data?.data.length ? notifs.data.data.map((n) => (
                    <li key={n.id} className="border-b border-gold/15 last:border-0">
                      <Link href={n.link ?? '#'} onClick={() => setMenu(null)} className="block px-4 py-2.5 hover:bg-gold/10">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && <p className="line-clamp-2 text-xs text-ink-muted">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-gold-deep">{timeAgo(n.createdAt)}</p>
                      </Link>
                    </li>
                  )) : <li className="px-4 py-6 text-center text-sm text-ink-muted">You are all caught up.</li>}
                </ul>
              </div>
            )}
          </div>
          <div className="relative">
            <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-gold/15" aria-expanded={menu === 'user'} aria-haspopup="menu" onClick={() => setMenu(menu === 'user' ? null : 'user')}>
              <Avatar name={me?.user.fullName ?? '?'} />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-semibold">{me?.user.fullName}</span>
                <span className="block text-[11px] text-ink-muted">{me ? ROLE_LABEL[me.user.role] : ''}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-gold-deep sm:block" aria-hidden />
            </button>
            {menu === 'user' && (
              <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-gold/50 bg-ivory p-1.5 shadow-lift">
                <div className="px-3 py-2 text-xs text-ink-muted"><p className="font-semibold text-ink">{me?.tenant.name}</p>{me?.user.email}</div>
                <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gold/10" onClick={async () => { await signOut(); qc.clear(); router.replace('/login'); }}>
                  <LogOut className="h-4 w-4 text-gold-deep" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-maroon-deep/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-up">
            <button className="absolute right-2 top-3 z-10 rounded-lg p-2 text-maroon-foreground hover:bg-gold/20" aria-label="Close navigation" onClick={() => setDrawer(false)}><X className="h-5 w-5" /></button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </>
  );
}

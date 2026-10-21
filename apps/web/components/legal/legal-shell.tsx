import Link from 'next/link';
import { Logo } from '@/components/brand/brand';
import { POLICY_VERSION } from '@techmunda/shared';

export function LegalShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-gold/40 bg-maroon px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-3xl items-center justify-between"><Link href="/login" aria-label="Techmunda home"><Logo /></Link><nav aria-label="Legal" className="flex gap-4 text-sm text-maroon-foreground"><Link className="hover:text-gold" href="/legal/terms">Terms</Link><Link className="hover:text-gold" href="/legal/privacy">Privacy</Link></nav></div></header>
      <main id="main" className="motif-bg mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <article className="panel p-6 sm:p-10">
          <p className="eyebrow">Version {POLICY_VERSION}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mt-3 text-[15px] text-ink-muted">{intro}</p>
          <div className="mt-6 space-y-6 text-[15px] leading-relaxed [&_a]:font-medium [&_a]:text-royal [&_a:hover]:underline [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5 [&_table]:w-full [&_td]:border-t [&_td]:border-gold/30 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-gold-deep">{children}</div>
        </article>
      </main>
    </div>
  );
}

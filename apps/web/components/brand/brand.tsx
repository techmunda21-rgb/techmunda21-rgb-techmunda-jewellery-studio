import { cn } from '@/lib/utils';

/** Lotus-in-diamond mark. Original artwork — not derived from any jeweller's logo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-9 w-9 text-gold', className)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
      <path d="M24 3 45 24 24 45 3 24Z" />
      <path d="M24 10 38 24 24 38 10 24Z" opacity=".55" />
      <path d="M24 14c-5 3-6.5 8-3.5 13 1 1.5 2.2 2.6 3.5 3.5 1.3-.9 2.5-2 3.5-3.5 3-5 1.5-10-3.5-13Z" fill="currentColor" fillOpacity=".18" />
      <path d="M24 30c-4 0-7-2-9-5 3-.5 6 .3 9 3 3-2.7 6-3.5 9-3-2 3-5 5-9 5Z" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ tone = 'light', subtitle = true, className }: { tone?: 'light' | 'dark'; subtitle?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-none">
        <p className={cn('font-editorial text-[26px] font-semibold tracking-wide', tone === 'light' ? 'text-maroon-foreground' : 'text-ink')}>Techmunda</p>
        {subtitle && <p className="mt-1 whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.2em] text-gold">AI Jewellery Growth Studio</p>}
      </div>
    </div>
  );
}

/** Heritage floral mandala used as a subtle ornament. */
export function Motif({ className }: { className?: string }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 200 200" className={cn('text-gold', className)} fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      {petals.map((deg) => (
        <path key={deg} transform={`rotate(${deg} 100 100)`} d="M100 100C86 80 86 46 100 20C114 46 114 80 100 100Z" opacity=".75" />
      ))}
      {petals.map((deg) => (
        <path key={`s${deg}`} transform={`rotate(${deg + 15} 100 100)`} d="M100 100C93 88 93 72 100 58C107 72 107 88 100 100Z" opacity=".5" />
      ))}
      <circle cx="100" cy="100" r="9" />
      <circle cx="100" cy="100" r="3" fill="currentColor" />
      <circle cx="100" cy="100" r="92" strokeDasharray="2 5" opacity=".6" />
    </svg>
  );
}

export function GoldDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-gold', className)} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/70" />
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" /></svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/70" />
    </div>
  );
}

/** Stylised illustrated necklace used on the login and enquiry hero panels (no stock photography is bundled). */
export function HeroJewel({ className }: { className?: string }) {
  const beads = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    return { x: 40 + t * 320, y: 30 + Math.sin(t * Math.PI) * 210, r: 7 + Math.sin(t * Math.PI) * 6 };
  });
  return (
    <svg viewBox="0 0 400 360" className={className} aria-hidden>
      <defs>
        <linearGradient id="hg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F5DC96" /><stop offset=".5" stopColor="#C9983F" /><stop offset="1" stopColor="#8F6420" /></linearGradient>
        <radialGradient id="hg-ruby"><stop offset="0" stopColor="#FF7A8A" /><stop offset="1" stopColor="#8A0B1E" /></radialGradient>
        <radialGradient id="hg-glow" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#F5DC96" stopOpacity=".35" /><stop offset="1" stopColor="#F5DC96" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="200" cy="170" rx="190" ry="170" fill="url(#hg-glow)" />
      <path d="M40 30 Q200 300 360 30" fill="none" stroke="url(#hg-gold)" strokeWidth="5" />
      <path d="M70 34 Q200 250 330 34" fill="none" stroke="url(#hg-gold)" strokeWidth="3" opacity=".7" />
      {beads.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={i % 3 === 1 ? 'url(#hg-ruby)' : 'url(#hg-gold)'} stroke="#6B4A14" strokeWidth="1.2" />)}
      <path d="M200 250 L226 282 L200 330 L174 282Z" fill="url(#hg-gold)" stroke="#6B4A14" strokeWidth="1.5" />
      <circle cx="200" cy="284" r="13" fill="url(#hg-ruby)" stroke="#6B4A14" strokeWidth="1.5" />
    </svg>
  );
}

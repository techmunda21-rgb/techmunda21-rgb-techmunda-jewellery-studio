'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const SLIDES = [
  { src: '/images/slides/bridal-model.jpg', title: 'Bridal Collection', note: 'Traditional elegance for a new beginning', pos: '50% 35%' },
  { src: '/images/slides/emerald-necklace.jpg', title: 'Emerald Heritage Necklace', note: 'Polki-style gold with emerald drops', pos: '50% 45%' },
  { src: '/images/slides/modern-model.jpg', title: 'Modern Everyday Gold', note: 'Light pieces for the contemporary wearer', pos: '50% 70%' },
  { src: '/images/slides/jhumka-earrings.jpg', title: 'Temple Jhumka Earrings', note: 'Pearl drops, handcrafted detail', pos: '50% 40%' },
  { src: '/images/slides/bridal-set.jpg', title: 'Ruby & Diamond Bridal Set', note: 'Necklace and earrings, made for the wedding day', pos: '50% 35%' },
  { src: '/images/slides/temple-bangles.jpg', title: 'Temple Gold Bangles', note: 'Filigree and ruby accents', pos: '50% 50%' },
  { src: '/images/slides/floral-pendant.jpg', title: 'Floral Diamond Pendant', note: 'Delicate daily-wear luxury', pos: '50% 50%' },
  { src: '/images/slides/solitaire-ring.jpg', title: 'Solitaire Diamond Ring', note: 'A halo of brilliance', pos: '50% 50%' },
];
const INTERVAL = 4500;

export function HeroSlider() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);
  const go = useCallback((n: number) => setI((n + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!playing || hover || reduced) return;
    const t = setTimeout(() => setI((x) => (x + 1) % SLIDES.length), INTERVAL);
    return () => clearTimeout(t);
  }, [i, playing, hover, reduced]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured jewellery"
      className="group relative overflow-hidden rounded-2xl border border-gold/50 bg-royal shadow-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className="relative h-48 sm:h-60 lg:h-72">
        {SLIDES.map((s, n) => (
          <div
            key={s.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${n + 1} of ${SLIDES.length}: ${s.title}`}
            aria-hidden={n !== i}
            className={cn('absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none', n === i ? 'opacity-100' : 'opacity-0')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.title} loading={n === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover" style={{ objectPosition: s.pos }} />
            <div className="absolute inset-0 bg-gradient-to-t from-royal/90 via-royal/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 pb-9 text-ivory sm:p-6 sm:pb-10">
              <p className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{s.title}</p>
              <p className="mt-1 text-sm text-ivory/85">{s.note}</p>
            </div>
          </div>
        ))}
      </div>

      <button type="button" aria-label="Previous slide" onClick={() => go(i - 1)} className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gold/70 bg-royal/70 text-ivory opacity-0 transition focus:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" aria-label="Next slide" onClick={() => go(i + 1)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gold/70 bg-royal/70 text-ivory opacity-0 transition focus:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
        <button type="button" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} onClick={() => setPlaying((p) => !p)} className="mr-1 flex h-6 w-6 items-center justify-center rounded-full border border-gold/70 text-gold-soft">
          {playing ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
        </button>
        {SLIDES.map((s, n) => (
          <button key={s.src} type="button" aria-label={`Go to slide ${n + 1}`} aria-current={n === i} onClick={() => go(n)} className={cn('h-2 rounded-full transition-all', n === i ? 'w-6 bg-gold' : 'w-2 bg-ivory/60 hover:bg-ivory')} />
        ))}
      </div>
      <p className="absolute right-3 top-2 rounded bg-royal/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ivory/80">Sample imagery</p>
    </section>
  );
}

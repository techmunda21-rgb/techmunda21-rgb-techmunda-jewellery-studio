'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 360° turntable viewer. It only ever shows REAL frames the team uploaded (ordered 0…n-1);
 * it never synthesises in-between angles. Drag / swipe, arrow keys, slider, or autoplay.
 */
export function SpinViewer({ frames, alt }: { frames: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const n = frames.length;
  const wrap = useCallback((v: number) => ((v % n) + n) % n, [n]);

  useEffect(() => { setLoaded(0); frames.forEach((src) => { const im = new Image(); im.onload = () => setLoaded((l) => l + 1); im.src = src; }); }, [frames]);
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => setI((v) => wrap(v + 1)), 110);
    return () => clearInterval(t);
  }, [playing, n, wrap]);

  const onDown = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, start: i }; setPlaying(false); };
  const onMove = (e: React.PointerEvent) => { if (drag.current) setI(wrap(drag.current.start - Math.round((e.clientX - drag.current.x) / (320 / n)))); };
  const ready = loaded >= n;

  return (
    <div className="space-y-2.5">
      <div
        role="slider" tabIndex={0} aria-label={`360 degree view of ${alt}. Use left and right arrow keys to rotate.`} aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={i} aria-valuetext={`${Math.round((i / n) * 360)} degrees`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { setPlaying(false); setI(wrap(i + 1)); } if (e.key === 'ArrowLeft') { setPlaying(false); setI(wrap(i - 1)); } }}
        className="relative aspect-[4/3] cursor-grab touch-pan-y select-none overflow-hidden rounded-xl border border-gold/50 bg-maroon-deep active:cursor-grabbing"
      >
        <img src={frames[i]} alt={`${alt} — ${Math.round((i / n) * 360)}°`} draggable={false} className="h-full w-full object-contain" />
        {!ready && <span className="absolute inset-x-0 bottom-0 bg-maroon-deep/80 px-3 py-1 text-center text-xs text-ivory">Loading frames {loaded}/{n}…</span>}
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-maroon-deep/80 px-2.5 py-1 text-[11px] font-semibold text-ivory"><RotateCw className="h-3 w-3 text-gold" aria-hidden />360° · {n} real frames</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} aria-label={playing ? 'Pause rotation' : 'Auto-rotate'} className="flex h-9 w-9 items-center justify-center rounded-full border border-gold bg-ivory text-royal hover:bg-gold/15">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Rotation angle" className={cn('h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gold/30 accent-[rgb(var(--royal))]')} />
        <span className="w-10 text-right text-xs tabular-nums text-ink-muted">{Math.round((i / n) * 360)}°</span>
      </div>
    </div>
  );
}

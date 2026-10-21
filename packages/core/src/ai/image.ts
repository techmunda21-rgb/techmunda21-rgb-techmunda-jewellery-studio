import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import type { AspectRatio } from '@techmunda/shared';
import { isOpenAiConfigured, type Env } from '../env';
import { mapOpenAiError } from './llm';
import { ProviderError } from './types';

export const OUTPUT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

export interface ImageEditRequest {
  source: Buffer;
  sourceMime: string;
  prompt: string;
  style: string;
  aspectRatio: AspectRatio;
  variations: number;
}
export interface ImageGenerateRequest {
  prompt: string;
  style: string;
  aspectRatio: AspectRatio;
  variations: number;
}
export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
  /** True when the pixels were NOT produced by an AI model. */
  simulated: boolean;
}
export interface ImageStatus {
  state: 'completed' | 'failed' | 'processing';
  message?: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly simulated: boolean;
  generate(req: ImageGenerateRequest): Promise<GeneratedImage[]>;
  edit(req: ImageEditRequest): Promise<GeneratedImage[]>;
  /** Both bundled providers are synchronous; async providers would poll their job id here. */
  getStatus(providerJobId: string): Promise<ImageStatus>;
}

/* ───────────────────────── OpenAI (live) ───────────────────────── */

function openAiSize(ratio: AspectRatio): '1024x1024' | '1024x1536' | '1536x1024' {
  if (ratio === '1:1') return '1024x1024';
  return ratio === '16:9' ? '1536x1024' : '1024x1536';
}

async function toTarget(buf: Buffer, ratio: AspectRatio): Promise<Buffer> {
  const { width, height } = OUTPUT_DIMENSIONS[ratio];
  return sharp(buf).resize(width, height, { fit: 'cover', position: 'centre' }).png().toBuffer();
}

export class OpenAiImageProvider implements ImageProvider {
  readonly name = 'openai-image';
  readonly simulated = false;
  private readonly client: OpenAI;
  constructor(private readonly env: Env) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 1 });
  }

  async generate(req: ImageGenerateRequest): Promise<GeneratedImage[]> {
    try {
      const res = await this.client.images.generate({ model: this.env.OPENAI_IMAGE_MODEL, prompt: req.prompt, size: openAiSize(req.aspectRatio), n: req.variations });
      return this.collect(res.data ?? [], req.aspectRatio);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw mapOpenAiError(err);
    }
  }

  async edit(req: ImageEditRequest): Promise<GeneratedImage[]> {
    try {
      const image = await toFile(req.source, 'source.png', { type: req.sourceMime });
      const res = await this.client.images.edit({ model: this.env.OPENAI_IMAGE_MODEL, image, prompt: req.prompt, size: openAiSize(req.aspectRatio), n: req.variations });
      return this.collect(res.data ?? [], req.aspectRatio);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw mapOpenAiError(err);
    }
  }

  private async collect(items: Array<{ b64_json?: string | null }>, ratio: AspectRatio): Promise<GeneratedImage[]> {
    const out: GeneratedImage[] = [];
    for (const item of items) {
      if (!item.b64_json) continue;
      out.push({ data: await toTarget(Buffer.from(item.b64_json, 'base64'), ratio), mimeType: 'image/png', simulated: false });
    }
    if (!out.length) throw new ProviderError('Image provider returned no images', 'PROVIDER_ERROR', true);
    return out;
  }

  async getStatus(): Promise<ImageStatus> {
    return { state: 'completed' };
  }
}

/* ───────────────────── Demo adapter (clearly labelled) ───────────────────── */

interface Palette {
  from: string;
  to: string;
  accent: string;
  motif: 'rings' | 'dots' | 'lines' | 'none';
}
const PALETTES: Record<string, Palette> = {
  luxury_editorial: { from: '#FFF9EF', to: '#EAD9B8', accent: '#B88A36', motif: 'lines' },
  bridal_collection: { from: '#8A0A1B', to: '#461318', accent: '#D9B15E', motif: 'rings' },
  diwali_festive: { from: '#F6B73C', to: '#7A2E0E', accent: '#FFE2A0', motif: 'dots' },
  minimal_ecommerce: { from: '#FFFFFF', to: '#F4EBDA', accent: '#B88A36', motif: 'none' },
  premium_black_gold: { from: '#1B1B1B', to: '#050505', accent: '#C9A04A', motif: 'lines' },
  lifestyle_campaign: { from: '#F9DEC4', to: '#F8EEDB', accent: '#B88A36', motif: 'dots' },
  dubai_boutique: { from: '#E9E6E1', to: '#BDB6AA', accent: '#B88A36', motif: 'lines' },
};

function backgroundSvg(w: number, h: number, p: Palette, variant: number): string {
  const shift = variant * 8;
  let motif = '';
  if (p.motif === 'rings') {
    motif = [0, 1, 2, 3].map((i) => `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * (0.3 + i * 0.12)}" fill="none" stroke="${p.accent}" stroke-opacity="${0.22 - i * 0.04}" stroke-width="2"/>`).join('');
  } else if (p.motif === 'dots') {
    motif = Array.from({ length: 26 }, (_, i) => {
      const x = ((i * 137 + variant * 53) % 100) / 100;
      const y = ((i * 71 + variant * 29) % 100) / 100;
      return `<circle cx="${x * w}" cy="${y * h}" r="${10 + ((i * 13) % 34)}" fill="${p.accent}" fill-opacity="${0.08 + ((i * 7) % 10) / 100}"/>`;
    }).join('');
  } else if (p.motif === 'lines') {
    motif = Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${h * (0.12 + i * 0.16)}" x2="${w}" y2="${h * (0.04 + i * 0.16)}" stroke="${p.accent}" stroke-opacity="0.18" stroke-width="2"/>`).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/></linearGradient>
      <radialGradient id="v" cx="50%" cy="${48 + shift / 4}%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${motif}<rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;
}

function labelSvg(w: number, h: number, accent: string): string {
  const text = 'DEMO SIMULATION · layout styling only, not an AI render';
  const bw = Math.min(w - 48, 760);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="${(w - bw) / 2}" y="${h - 84}" rx="22" ry="22" width="${bw}" height="44" fill="#351B1D" fill-opacity="0.82" stroke="${accent}" stroke-width="1.5"/>
    <text x="${w / 2}" y="${h - 55}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" fill="#FFF9EF" letter-spacing="1">${text}</text>
  </svg>`;
}

/**
 * Deterministic demo provider: composites the ORIGINAL photo onto a styled backdrop using sharp.
 * It performs no AI and cannot alter the jewellery — every output is labelled DEMO SIMULATION.
 */
export class DemoImageProvider implements ImageProvider {
  readonly name = 'demo-simulation';
  readonly simulated = true;

  async generate(): Promise<GeneratedImage[]> {
    throw new ProviderError('The demo adapter cannot generate images from text; upload a source photo.', 'POLICY_REJECTED', false);
  }

  async edit(req: ImageEditRequest): Promise<GeneratedImage[]> {
    const { width: w, height: h } = OUTPUT_DIMENSIONS[req.aspectRatio];
    const palette = PALETTES[req.style] ?? PALETTES.luxury_editorial;
    const results: GeneratedImage[] = [];
    for (let v = 0; v < req.variations; v++) {
      const pad = 0.1 + v * 0.025;
      const innerW = Math.round(w * (1 - pad * 2));
      const innerH = Math.round(h * (1 - pad * 2) - 70);
      const photo = await sharp(req.source).rotate().resize(innerW, innerH, { fit: 'inside' }).png().toBuffer();
      const meta = await sharp(photo).metadata();
      const pw = meta.width ?? innerW;
      const ph = meta.height ?? innerH;
      const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="28" ry="28" fill="#fff"/></svg>`);
      const rounded = await sharp(photo).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
      const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw + 24}" height="${ph + 24}"><rect x="2" y="2" rx="34" ry="34" width="${pw + 20}" height="${ph + 20}" fill="none" stroke="${palette.accent}" stroke-width="3"/></svg>`);
      const left = Math.round((w - pw) / 2);
      const top = Math.round((h - ph) / 2 - 20);
      const out = await sharp(Buffer.from(backgroundSvg(w, h, palette, v)))
        .composite([
          { input: frame, left: left - 12, top: top - 12 },
          { input: rounded, left, top },
          { input: Buffer.from(labelSvg(w, h, palette.accent)), left: 0, top: 0 },
        ])
        .png()
        .toBuffer();
      results.push({ data: out, mimeType: 'image/png', simulated: true });
    }
    return results;
  }

  async getStatus(): Promise<ImageStatus> {
    return { state: 'completed', message: 'Simulation adapter — completes synchronously' };
  }
}

export function getImageProvider(env: Env): ImageProvider {
  if (env.AI_MODE === 'openai' && !env.OPENAI_API_KEY) throw new ProviderError('AI_MODE=openai but OPENAI_API_KEY is missing', 'NOT_CONFIGURED');
  return isOpenAiConfigured(env) ? new OpenAiImageProvider(env) : new DemoImageProvider();
}

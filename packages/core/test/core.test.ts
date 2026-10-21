import { describe, expect, it, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { z } from 'zod';
import { qualificationOutputSchema } from '@techmunda/shared';
import { decryptSecret, encryptSecret, signPayload, verifyHmacHex, verifyPayload } from '../src/crypto';
import { loadEnv } from '../src/env';
import { parseBudget } from '../src/ai/budget';
import { computeLeadScore } from '../src/ai/scoring';
import { findUnsupportedFigures, generateFollowUpDraft } from '../src/ai/drafts';
import { buildCreativeBrief } from '../src/ai/brief';
import { DemoImageProvider, getImageProvider } from '../src/ai/image';
import { ProviderError } from '../src/ai/types';
import { scrubSecrets } from '../src/redact';

const base = {
  DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), URL_SIGNING_SECRET: 'c'.repeat(40),
} as NodeJS.ProcessEnv;

const llm = vi.hoisted(() => ({ out: null as unknown, err: null as unknown }));
vi.mock('../src/ai/llm', async (orig) => {
  const real = await orig<typeof import('../src/ai/llm')>();
  return { ...real, getTextLLM: (env: any) => (env.OPENAI_API_KEY ? { name: 'mock', completeJson: async ({ schema }: any) => { if (llm.err) throw llm.err; return schema.parse(llm.out); } } : null) };
});
import { qualifyEnquiry } from '../src/ai/qualification';

describe('qualification', () => {
  const input = { message: 'I want a diamond necklace for my wedding, budget 10-15 lakhs, visit next week', productInterest: null, budgetRange: null, preferredMaterial: null, purchaseTimeline: null, appointmentRequested: true };
  beforeEach(() => { llm.out = null; llm.err = null; });

  it('without credentials uses the clearly-labelled rule engine and validates against the strict schema', async () => {
    const r = await qualifyEnquiry(loadEnv(base, ), input);
    expect(r.source).toBe('SIMULATED_RULES');
    expect(() => qualificationOutputSchema.parse(r.output)).not.toThrow();
    expect(r.output.budget_min).toBe(1_000_000);
    expect(r.output.budget_max).toBe(1_500_000);
    expect(r.output.qualification_score).toBeGreaterThan(60);
  });

  it('LLM output is schema-validated; the deterministic score overrides the model score', async () => {
    llm.out = { intent: 'purchase', product_category: 'Necklace', budget_min: 1_000_000, budget_max: 1_500_000, purchase_timeline: 'December', qualification_score: 3, qualification_reason: 'Stated facts only', suggested_next_action: 'Call', requires_human_review: false };
    const r = await qualifyEnquiry(loadEnv({ ...base, OPENAI_API_KEY: 'sk-test-xxxxxxxxxxxxxxxxxxxx' }), input);
    expect(r.source).toBe('LLM');
    expect(r.output.qualification_score).toBeGreaterThan(60);
    expect((r.rawModelOutput as any).qualification_score).toBe(3);
  });

  it('LLM budget numbers that cannot be traced to the customer text are nulled (no hallucinated budgets)', async () => {
    llm.out = { intent: 'purchase', product_category: 'Necklace', budget_min: 900000, budget_max: 950000, purchase_timeline: null, qualification_score: 90, qualification_reason: 'x', suggested_next_action: 'y', requires_human_review: false };
    const r = await qualifyEnquiry(loadEnv({ ...base, OPENAI_API_KEY: 'sk-test-xxxxxxxxxxxxxxxxxxxx' }), { ...input, message: 'Hello, do you sell necklaces?', appointmentRequested: false });
    expect(r.output.budget_min).toBeNull();
    expect(r.output.budget_max).toBeNull();
    expect(r.output.qualification_score).toBeLessThan(50);
  });

  it('malformed model output is rejected by the schema', () => {
    expect(() => qualificationOutputSchema.parse({ intent: 'buy-now', qualification_score: 150 })).toThrow();
    expect(() => qualificationOutputSchema.parse({ intent: 'purchase', product_category: null, budget_min: -5, budget_max: null, purchase_timeline: null, qualification_score: 10, qualification_reason: '', suggested_next_action: '', requires_human_review: true })).toThrow();
  });

  it('provider errors propagate (never silently replaced by simulated results)', async () => {
    llm.err = new ProviderError('rate limited', 'RATE_LIMITED', true);
    await expect(qualifyEnquiry(loadEnv({ ...base, OPENAI_API_KEY: 'sk-test-xxxxxxxxxxxxxxxxxxxx' }), input)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('scoring weights (prioritisation heuristic, max 100)', () => {
  it('sums the documented weights', () => {
    const full = computeLeadScore({ intent: 'purchase', productCategory: 'Necklace', budgetMin: 1, budgetMax: 2, purchaseTimeline: 'Within 1 month', appointmentRequested: true });
    expect(full.breakdown).toEqual({ intent: 30, budget: 20, timeframe: 20, product: 15, appointment: 15 });
    expect(full.score).toBe(100);
    expect(computeLeadScore({ intent: 'unknown', productCategory: null, budgetMin: null, budgetMax: null, purchaseTimeline: null, appointmentRequested: false }).score).toBe(0);
  });
});

describe('budget parsing', () => {
  it.each([
    ['₹10L – ₹15L', 1_000_000, 1_500_000], ['10-15 lakhs', 1_000_000, 1_500_000], ['1.5 crore', 15_000_000, 15_000_000], ['under 50,000', null, 50_000],
    ['above 5 lakh', 500_000, null], ['₹5,00,000 - ₹6,00,000', 500_000, 600_000], ['no idea', null, null],
  ])('%s', (text, min, max) => { expect(parseBudget(text as string)).toEqual({ min, max }); });
});

describe('draft guard', () => {
  it('flags monetary figures not present in the allowed context (invented prices/discounts)', () => {
    expect(findUnsupportedFigures('Get 20% off, special price ₹9,99,000 today', 'budget ₹10,00,000')).toEqual(['₹9,99,000']);
    expect(findUnsupportedFigures('Within your budget of ₹10,00,000', 'budget ₹10,00,000')).toEqual([]);
  });
  it('refuses to save an LLM draft that invents a price', async () => {
    llm.err = null;
    llm.out = { subject: 'Your necklace', body: 'Dear Priya, we can offer this at a special price of ₹7,77,777 just for you. Warm regards.' };
    await expect(generateFollowUpDraft(loadEnv({ ...base, OPENAI_API_KEY: 'sk-test-xxxxxxxxxxxxxxxxxxxx' }), { businessName: 'B', senderName: 'S', customerFirstName: 'Priya', productInterest: 'Necklace', budgetText: null, timeline: null, appointmentText: null, message: null, tone: 'warm', catalogue: [] })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });
});

describe('crypto', () => {
  const key = Buffer.alloc(32, 9).toString('base64');
  it('AES-GCM round-trips and detects tampering', () => {
    const c = encryptSecret('{"refresh_token":"abc"}', key);
    expect(c).not.toContain('abc');
    expect(decryptSecret(c, key)).toBe('{"refresh_token":"abc"}');
    const parts = c.split('.'); parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  });
  it('signed payloads expire and reject forgeries', () => {
    const t = signPayload({ a: 1 }, 'secret-secret-secret-secret-1234', 60);
    expect(verifyPayload(t, 'secret-secret-secret-secret-1234')).toMatchObject({ a: 1 });
    expect(verifyPayload(t, 'other-secret-other-secret-other-1')).toBeNull();
    expect(verifyPayload(signPayload({ a: 1 }, 'secret-secret-secret-secret-1234', -5), 'secret-secret-secret-secret-1234')).toBeNull();
    expect(verifyHmacHex('body', 'abc', 'k')).toBe(false);
  });
  it('scrubs secrets from log text', () => {
    expect(scrubSecrets('failed with key sk-abcdefghijklmnopqrstuvwxyz and Bearer abcdefghijklmnop')).not.toMatch(/sk-abc|abcdefghijklmnop/);
  });
});

describe('config and image provider', () => {
  it('env validation fails fast with a readable message', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'short' } as any)).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('AI_MODE=openai without a key is reported as NOT_CONFIGURED', () => {
    expect(() => getImageProvider(loadEnv({ ...base, AI_MODE: 'openai' }))).toThrow(ProviderError);
  });
  it('auto mode without a key selects the labelled demo adapter', () => {
    const p = getImageProvider(loadEnv(base));
    expect(p.simulated).toBe(true);
    expect(p.name).toBe('demo-simulation');
  });
  it('demo adapter outputs correctly-sized, labelled images and never claims to be AI', async () => {
    const src = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#cc9' } }).png().toBuffer();
    const out = await new DemoImageProvider().edit({ source: src, sourceMime: 'image/png', prompt: 'p', style: 'diwali_festive', aspectRatio: '9:16', variations: 2 });
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.simulated)).toBe(true);
    expect(await sharp(out[0].data).metadata()).toMatchObject({ width: 1080, height: 1920 });
  });
  it('creative brief only uses catalogue facts and carries preservation constraints', () => {
    const b = buildCreativeBrief({ name: 'Ring', category: 'Ring', metalType: null, purity: null, stoneType: null }, 'minimal_ecommerce', '1:1', 'soft shadows');
    expect(b.prompt).not.toMatch(/22K|diamond/i);
    expect(b.mustNotDo.join(' ')).toMatch(/hallmark|purity|weight|claims/i);
    expect(() => buildCreativeBrief({ name: 'x', category: 'y' }, 'nope', '1:1')).toThrow();
  });
  void z;
});

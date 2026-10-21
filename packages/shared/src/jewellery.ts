/**
 * Metal purity rules. Purity and weight are FACTS entered from the hallmark/weighing record — never inferred from a photo.
 * Gold uses Indian hallmark (BIS) fineness: 24K=999, 22K=916, 21K=875, 18K=750, 14K=585, 9K=375.
 */
export interface PurityInfo { label: string; fineness: number }

const GOLD: PurityInfo[] = [
  { label: '24K', fineness: 999 }, { label: '22K', fineness: 916 }, { label: '21K', fineness: 875 },
  { label: '18K', fineness: 750 }, { label: '14K', fineness: 585 }, { label: '9K', fineness: 375 },
];
const PLATINUM: PurityInfo[] = [{ label: 'Pt 950', fineness: 950 }, { label: 'Pt 900', fineness: 900 }, { label: 'Pt 850', fineness: 850 }];
const SILVER: PurityInfo[] = [{ label: '999', fineness: 999 }, { label: '925', fineness: 925 }, { label: '800', fineness: 800 }];

export type MetalFamily = 'gold' | 'platinum' | 'silver' | 'other';
export const metalFamily = (metal?: string | null): MetalFamily => {
  const m = (metal ?? '').toLowerCase();
  if (/plat/.test(m)) return 'platinum';
  if (/silver/.test(m)) return 'silver';
  if (/gold/.test(m)) return 'gold';
  return 'other';
};

export const PURITY_OPTIONS: Record<Exclude<MetalFamily, 'other'>, PurityInfo[]> = { gold: GOLD, platinum: PLATINUM, silver: SILVER };

/** Accepts "22K", "22 karat", "916", "22K/916", "Pt950"… → canonical entry, or null when it is not a recognised standard. */
export function parsePurity(metal: string | null | undefined, input: string | null | undefined): PurityInfo | null {
  const fam = metalFamily(metal);
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw || fam === 'other') return null;
  const list = PURITY_OPTIONS[fam];
  const karat = raw.match(/(\d{1,2})\s*(?:k|kt|karat|carat)\b/);
  if (fam === 'gold' && karat) return GOLD.find((p) => p.label === `${karat[1]}K`) ?? null;
  const digits = raw.match(/\d{3}/);
  if (digits) return list.find((p) => String(p.fineness) === digits[0]) ?? null;
  return null;
}

/** Pure metal content in grams = gross weight × fineness / 1000 (stones/other materials in the weight are NOT deducted). */
export function pureMetalGrams(weightGrams: number | null | undefined, fineness: number | null | undefined): number | null {
  if (!weightGrams || !fineness || weightGrams <= 0) return null;
  return Math.round(weightGrams * fineness) / 1000;
}

export function purityError(metal: string | null | undefined, purity: string | null | undefined): string | null {
  if (!purity?.trim()) return null;
  const fam = metalFamily(metal);
  if (fam === 'other') return null;
  if (parsePurity(metal, purity)) return null;
  return `"${purity}" is not a recognised ${fam} purity (use ${PURITY_OPTIONS[fam].map((p) => p.label).join(', ')})`;
}

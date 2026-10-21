/**
 * Best-effort budget parser for free text such as "₹10–15 lakhs", "10L", "1.5 crore", "AED 20,000".
 * Returns nulls when nothing can be read — never invents a number.
 */
export interface BudgetRange {
  min: number | null;
  max: number | null;
}

const UNIT: Record<string, number> = { k: 1_000, thousand: 1_000, l: 100_000, lac: 100_000, lacs: 100_000, lakh: 100_000, lakhs: 100_000, cr: 10_000_000, crore: 10_000_000, crores: 10_000_000, m: 1_000_000, million: 1_000_000 };

export function parseBudget(text: string | null | undefined): BudgetRange {
  if (!text) return { min: null, max: null };
  const t = text.toLowerCase().replace(/,/g, '');
  const cur = '(?:₹|rs\\.?|inr|aed|usd|\\$)?\\s*';
  const num = '(\\d+(?:\\.\\d+)?)';
  const unit = '(k|thousand|lakhs?|lacs?|l|crores?|cr|million|m)?';
  const range = new RegExp(`${cur}${num}\\s*${unit}\\s*(?:-|–|—|to)\\s*${cur}${num}\\s*${unit}`);
  const single = new RegExp(`${num}\\s*${unit}`);
  const r = t.match(range);
  if (r) {
    const unitB = r[4] ?? r[2];
    const unitA = r[2] ?? r[4];
    const a = Number(r[1]) * (unitA ? UNIT[unitA] ?? 1 : 1);
    const b = Number(r[3]) * (unitB ? UNIT[unitB] ?? 1 : 1);
    if (a > 0 && b > 0) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const under = t.match(new RegExp(`(?:under|below|upto|up to|within|max(?:imum)?)\\s*[^\\d]{0,4}${num}\\s*${unit}`));
  if (under) {
    const v = Number(under[1]) * (under[2] ? UNIT[under[2]] ?? 1 : 1);
    if (v > 0) return { min: null, max: v };
  }
  const over = t.match(new RegExp(`(?:above|over|more than|\\+)\\s*[^\\d]{0,4}${num}\\s*${unit}`));
  if (over) {
    const v = Number(over[1]) * (over[2] ? UNIT[over[2]] ?? 1 : 1);
    if (v > 0) return { min: v, max: null };
  }
  const s = t.match(single);
  if (s) {
    const v = Number(s[1]) * (s[2] ? UNIT[s[2]] ?? 1 : 1);
    if (v >= 1000) return { min: v, max: v };
  }
  return { min: null, max: null };
}

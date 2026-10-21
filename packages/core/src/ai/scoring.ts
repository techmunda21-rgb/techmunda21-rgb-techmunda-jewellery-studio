import { LEAD_SCORE_WEIGHTS, type QualificationOutput } from '@techmunda/shared';

export interface ScoreInput {
  intent: QualificationOutput['intent'];
  productCategory: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  purchaseTimeline: string | null;
  appointmentRequested: boolean;
}

/** Map free-text timeline to urgency 0..1. Unknown text counts as a weak signal; null counts as none. */
export function timelineUrgency(timeline: string | null): number {
  if (!timeline) return 0;
  const t = timeline.toLowerCase();
  if (/browsing|not sure|no rush|exploring|just looking/.test(t)) return 0.1;
  if (/immediate|urgent|asap|this week|within (a )?(week|2 weeks|15 days)|within 1 month|within 30 days|this month|next month|<\s*1 month|1 month|diwali|wedding (in|next)/.test(t)) return 1;
  if (/1-3|1–3|2-3|3 months|within 3|quarter|1 to 3/.test(t)) return 0.7;
  if (/3-6|3–6|6 months|within 6|6\+|year/.test(t)) return 0.4;
  return 0.4;
}

const GENERIC_CATEGORY = /^(jewell?ery|jewels?|ornaments?|gold|silver|something)$/i;

/**
 * Deterministic prioritisation heuristic (NOT a probability of purchase).
 * Weights: intent 30, budget 20, timeframe 20, specific product 15, appointment 15.
 */
export function computeLeadScore(i: ScoreInput): { score: number; breakdown: Record<string, number> } {
  const w = LEAD_SCORE_WEIGHTS;
  const intentPts = i.intent === 'purchase' ? w.purchaseIntent : i.intent === 'appointment' ? Math.round(w.purchaseIntent * 0.67) : i.intent === 'research' ? Math.round(w.purchaseIntent * 0.33) : 0;
  const hasMin = i.budgetMin != null;
  const hasMax = i.budgetMax != null;
  const budgetPts = hasMin && hasMax ? w.budget : hasMin || hasMax ? Math.round(w.budget * 0.6) : 0;
  const timePts = Math.round(w.timeframe * timelineUrgency(i.purchaseTimeline));
  const productPts = !i.productCategory ? 0 : GENERIC_CATEGORY.test(i.productCategory.trim()) ? Math.round(w.specificProduct / 3) : w.specificProduct;
  const apptPts = i.appointmentRequested ? w.appointment : 0;
  const breakdown = { intent: intentPts, budget: budgetPts, timeframe: timePts, product: productPts, appointment: apptPts };
  const score = Math.min(100, intentPts + budgetPts + timePts + productPts + apptPts);
  return { score, breakdown };
}

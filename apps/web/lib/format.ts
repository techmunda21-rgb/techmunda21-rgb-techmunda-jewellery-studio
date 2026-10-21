const symbols: Record<string, string> = { INR: '₹', AED: 'AED ', USD: '$' };

export function money(n: number | null | undefined, currency = 'INR'): string {
  if (n == null) return '—';
  const sym = symbols[currency] ?? `${currency} `;
  return `${sym}${new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(n)}`;
}

/** ₹24.5L / ₹1.2Cr style for dashboards (Indian numbering). */
export function moneyCompact(n: number | null | undefined, currency = 'INR'): string {
  if (n == null) return '—';
  const sym = symbols[currency] ?? `${currency} `;
  if (currency !== 'INR') return `${sym}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sym}${trim(n / 1e7)}Cr`;
  if (abs >= 1e5) return `${sym}${trim(n / 1e5)}L`;
  if (abs >= 1e3) return `${sym}${trim(n / 1e3)}K`;
  return `${sym}${Math.round(n)}`;
}
const trim = (v: number) => v.toFixed(1).replace(/\.0$/, '');

export function budgetRange(min: number | null, max: number | null, currency = 'INR'): string {
  if (min == null && max == null) return 'Not stated';
  if (min != null && max != null && min !== max) return `${moneyCompact(min, currency)} – ${moneyCompact(max, currency)}`;
  return moneyCompact(min ?? max, currency);
}

export function timeAgo(date: string | Date): string {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const dateOnly = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const ACTION_LABELS: Record<string, string> = {
  'lead.created': 'Enquiry received', 'lead.qualified': 'AI qualification completed', 'lead.stage_changed': 'Stage changed', 'lead.assigned': 'Lead assigned',
  'lead.repeat_enquiry': 'Repeat enquiry', 'lead.imported': 'Imported from CSV', 'lead.requalify_requested': 'Re-qualification requested', 'consent.recorded': 'Consent recorded',
  'consent.withdrawn': 'Consent withdrawn', 'note.added': 'Note added', 'task.created': 'Task created', 'task.completed': 'Task completed',
  'email.draft_created': 'Email draft created', 'email.draft_edited': 'Email draft edited', 'email.approval_invalidated': 'Edit invalidated the approval', 'email.approval_requested': 'Approval requested',
  'email.approved': 'Email approved', 'email.rejected': 'Email rejected', 'email.sent': 'Email sent via Gmail', 'email.send_failed': 'Email send failed',
  'opportunity.created': 'Opportunity created', 'opportunity.value_changed': 'Opportunity value changed',
  'creative.requested': 'Creative requested', 'creative.generated': 'Creative generated', 'creative.failed': 'Creative failed', 'creative.submitted_for_review': 'Submitted for review',
  'creative.approved': 'Asset approved', 'creative.rejected': 'Asset rejected',
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a.replace(/[._]/g, ' ');

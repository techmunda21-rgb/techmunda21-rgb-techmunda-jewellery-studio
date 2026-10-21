import { AlertTriangle, CheckCircle2, Clock, FileEdit, Loader2, Send, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type State = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'SENDING' | 'SENT' | 'REJECTED' | 'SEND_FAILED';

/** Each state has its own colour AND icon AND label, so it never relies on colour alone. */
const STATES: Record<State, { label: string; cls: string; Icon: typeof Clock; spin?: boolean }> = {
  DRAFT: { label: 'Draft', cls: 'border-status-draft/40 bg-status-draft/10 text-status-draft', Icon: FileEdit },
  PENDING_REVIEW: { label: 'Pending review', cls: 'border-status-pending/45 bg-status-pending/12 text-status-pending', Icon: Clock },
  APPROVED: { label: 'Approved', cls: 'border-status-approved/45 bg-status-approved/12 text-status-approved', Icon: CheckCircle2 },
  SENDING: { label: 'Sending…', cls: 'border-status-sent/45 bg-status-sent/12 text-status-sent', Icon: Loader2, spin: true },
  SENT: { label: 'Sent', cls: 'border-status-sent/55 bg-status-sent text-ivory', Icon: Send },
  REJECTED: { label: 'Rejected', cls: 'border-status-rejected/45 bg-status-rejected/10 text-status-rejected', Icon: XCircle },
  SEND_FAILED: { label: 'Send failed', cls: 'border-status-rejected/55 bg-status-rejected text-ivory', Icon: AlertTriangle },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = STATES[status as State] ?? STATES.DRAFT;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', s.cls, className)}>
      <s.Icon className={cn('h-3.5 w-3.5', s.spin && 'animate-spin')} aria-hidden />
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = 'gold', className }: { children: React.ReactNode; tone?: 'gold' | 'green' | 'red' | 'blue' | 'muted'; className?: string }) {
  const tones = {
    gold: 'border-gold/50 bg-gold/15 text-gold-deep',
    green: 'border-status-approved/40 bg-status-approved/12 text-status-approved',
    red: 'border-status-rejected/40 bg-status-rejected/10 text-status-rejected',
    blue: 'border-status-sent/40 bg-status-sent/10 text-status-sent',
    muted: 'border-ink/15 bg-ink/5 text-ink-muted',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', tones[tone], className)}>{children}</span>;
}

/** Live vs simulated is always labelled, never implied. */
export function ModeBadge({ simulated }: { simulated: boolean }) {
  return simulated ? <Pill tone="gold">DEMO SIMULATION</Pill> : <Pill tone="green">LIVE AI</Pill>;
}

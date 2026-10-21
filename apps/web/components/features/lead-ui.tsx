import { Pill } from '@/components/ui/badge';

export const ScoreChip = ({ score }: { score: number | null }) =>
  score == null ? <Pill tone="muted">Unscored</Pill> : <Pill tone={score >= 70 ? 'green' : score >= 40 ? 'gold' : 'muted'}>{score}/100</Pill>;

export const stageTone = (s: string) => (s === 'WON' ? 'green' : s === 'LOST' ? 'muted' : s === 'NEW' ? 'blue' : 'gold') as 'green' | 'muted' | 'blue' | 'gold';

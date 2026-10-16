import { money, pct } from './format';
import type { PeriodMetrics } from './metrics';

export interface PitchPart {
  text: string;
  strong?: boolean;
}

/**
 * Elevator pitch (spec §7.3). `periodPhrase` is "In October", "So far in 2026", etc.
 * Returned as parts so the UI can bold the numbers and Copy can join them as plain text.
 */
export function pitchParts(m: PeriodMetrics, periodPhrase: string): PitchPart[] {
  return [
    { text: `${periodPhrase} I completed ` },
    { text: `${m.n} appointment${m.n === 1 ? '' : 's'}`, strong: true },
    { text: ' for ' },
    { text: `${m.uniqueClients} unique client${m.uniqueClients === 1 ? '' : 's'}`, strong: true },
    { text: ', producing ' },
    { text: money(m.grossCents), strong: true },
    { text: ' in gross billing with an average service ticket of ' },
    { text: money(m.avgTicketCents), strong: true },
    { text: '. ' },
    { text: pct(m.retention), strong: true },
    { text: ' of my clients were returning patients, I rebooked ' },
    { text: pct(m.rebookRate), strong: true },
    { text: ' at checkout, and ' },
    { text: pct(m.independence), strong: true },
    { text: ' of my chair came from my own network and referrals rather than clinic leads.' },
  ];
}

export function pitchText(parts: PitchPart[]): string {
  return parts.map((p) => p.text).join('');
}

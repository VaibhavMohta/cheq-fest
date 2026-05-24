import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { ArenaType, Confidence, TrackableEvent } from '@/types/sport';

export type ConfidenceMap = {
  playersOnField: Confidence;
  substitutes: Confidence;
  duration: Confidence;
  format: Confidence;
  points: Confidence;
  trackableEvents: Confidence;
  arenaType: Confidence;
};

export type ParsedSport = {
  name: string;
  playersOnField: number;
  substitutes: number;
  duration: string;
  format: string;
  points: { win: number; draw: number; loss: number };
  trackableEvents: TrackableEvent[];
  arenaType: ArenaType;
  confidence: ConfidenceMap;
};

export type ParsedRulebook = { sports: ParsedSport[] };

// Default callable timeout is 70s — bump to 120s to match the function's
// server-side timeout. Cold-start + LLM call can take ~30-60s.
const callable = httpsCallable<
  { text?: string; storagePath?: string },
  ParsedRulebook
>(functions, 'parseRulebook', { timeout: 120_000 });

export async function parseRulebook(
  input: { text: string } | { storagePath: string },
): Promise<ParsedRulebook> {
  const res = await callable(input);
  return res.data;
}

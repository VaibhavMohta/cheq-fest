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

// Default callable timeout is 70s. Server-side function timeout is 540s
// (Gen 2 max); the client mirrors that so a slow Sonnet call doesn't
// surface as an opaque 504 just because the client gave up first.
const callable = httpsCallable<
  { text?: string; storagePath?: string },
  ParsedRulebook
>(functions, 'parseRulebook', { timeout: 540_000 });

export async function parseRulebook(
  input: { text: string } | { storagePath: string },
): Promise<ParsedRulebook> {
  const res = await callable(input);
  return res.data;
}

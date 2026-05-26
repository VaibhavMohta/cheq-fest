import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { ColorSlot } from '@/types/team';

export type ColorSuggestion = {
  color: ColorSlot;
  rationale: string;
};

const callable = httpsCallable<
  { storagePath: string; excludeColors: ColorSlot[] },
  { suggestions: ColorSuggestion[] }
>(functions, 'suggestTeamColor', { timeout: 60_000 });

export async function suggestTeamColor(args: {
  storagePath: string;
  excludeColors: ColorSlot[];
}): Promise<ColorSuggestion[]> {
  const res = await callable(args);
  return res.data.suggestions;
}

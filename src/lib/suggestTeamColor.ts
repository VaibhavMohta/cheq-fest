import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type ColorSuggestion = {
  /** Hex of the picked palette entry, e.g. "#ff4a1c". */
  color: string;
  rationale: string;
};

const callable = httpsCallable<
  { storagePath: string; excludeColors: string[] },
  { suggestions: ColorSuggestion[] }
>(functions, 'suggestTeamColor', { timeout: 60_000 });

export async function suggestTeamColor(args: {
  storagePath: string;
  excludeColors: string[];
}): Promise<ColorSuggestion[]> {
  const res = await callable(args);
  return res.data.suggestions;
}

import type { Timestamp } from 'firebase/firestore';

/**
 * One record per Anthropic API call. Written server-side from Cloud Functions
 * after a successful inference; admin-only read on the client.
 */
export type AiUsageDoc = {
  at: Timestamp;
  by: string; // uid of admin who triggered the call
  /** Which capability triggered the call. Add more as we wire more AI features. */
  kind: 'parseRulebook';
  /** The Claude model id used (so cost math survives model swaps). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cached prefix tokens that got written this call (billed ~1.25x input). */
  cacheCreationTokens: number;
  /** Cached prefix tokens served from cache (billed ~0.1x input). */
  cacheReadTokens: number;
  /** Total USD cost — computed server-side using the model's published rates. */
  costUsd: number;
};

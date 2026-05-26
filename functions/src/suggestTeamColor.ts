/**
 * AI color recommender — looks at a jersey photo and picks which of the 4
 * brand color slots best matches, skipping any already claimed by other
 * teams in this event.
 *
 * Uses Claude Haiku 4.5 with vision (cheapest tier; this is a quick visual
 * judgment task and doesn't need Sonnet). Returns 1-3 ranked suggestions.
 *
 * Auth: admin or super-admin only.
 */
import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-haiku-4-5';

const COLOR_SLOTS = ['accent', 'accent-2', 'accent-3', 'accent-4'] as const;
type ColorSlot = (typeof COLOR_SLOTS)[number];

const COLOR_INFO: Record<ColorSlot, { hex: string; description: string }> = {
  accent: { hex: '#ff4a1c', description: 'lava orange — warm, energetic' },
  'accent-2': { hex: '#e8ff4a', description: 'electric lime — bright, neon-green-yellow' },
  'accent-3': { hex: '#4ad4ff', description: 'signal cyan — cool, sky-blue' },
  'accent-4': { hex: '#ff4ad0', description: 'hot pink — vivid, magenta-pink' },
};

const SUGGESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['color', 'rationale'],
        properties: {
          color: {
            type: 'string',
            enum: COLOR_SLOTS,
            description: 'Which of the 4 brand color slots best matches.',
          },
          rationale: {
            type: 'string',
            description: 'One-sentence reason this color matches the jersey.',
          },
        },
      },
    },
  },
} as const;

type Suggestion = { color: ColorSlot; rationale: string };

export const suggestTeamColor = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '512MiB' },
  async (req): Promise<{ suggestions: Suggestion[] }> => {
    const claims = req.auth?.token as { admin?: boolean; superAdmin?: boolean } | undefined;
    if (!claims?.admin && !claims?.superAdmin) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }

    const { storagePath, excludeColors } = (req.data ?? {}) as {
      storagePath?: string;
      excludeColors?: string[];
    };

    if (!storagePath) {
      throw new HttpsError('invalid-argument', '`storagePath` is required.');
    }

    const exclude = new Set(excludeColors ?? []);
    const available = COLOR_SLOTS.filter((c) => !exclude.has(c));
    if (available.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'All 4 colors are already used — no more teams can be created in this event.',
      );
    }

    // Load image bytes from Storage.
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', `No file at ${storagePath}`);
    }
    const [meta] = await file.getMetadata();
    const mediaType = (meta.contentType ?? 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';
    const [buffer] = await file.download();
    const base64 = buffer.toString('base64');

    const key = ANTHROPIC_API_KEY.value();
    if (!key) {
      logger.warn('ANTHROPIC_API_KEY not set — returning stub suggestion.');
      return { suggestions: available.slice(0, 2).map((color) => ({
        color,
        rationale: 'Stub suggestion (no API key set).',
      })) };
    }

    const client = new Anthropic({ apiKey: key });
    const prompt = buildPrompt(available, Array.from(exclude) as ColorSlot[]);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        format: {
          type: 'json_schema',
          schema: SUGGESTIONS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    if (!textBlock) {
      throw new HttpsError('internal', 'No text block in response.');
    }

    let parsed: { suggestions: Suggestion[] };
    try {
      parsed = JSON.parse(textBlock.text) as { suggestions: Suggestion[] };
    } catch (err) {
      logger.error('Could not parse model output as JSON', { text: textBlock.text });
      throw new HttpsError('internal', 'Model returned invalid JSON.');
    }

    // Defense in depth — strip any suggestion that uses a now-claimed slot
    // (the model shouldn't, given the prompt, but better safe than sorry).
    parsed.suggestions = parsed.suggestions.filter((s) => available.includes(s.color));
    if (parsed.suggestions.length === 0) {
      parsed.suggestions = available.slice(0, 1).map((color) => ({
        color,
        rationale: 'Fallback — model suggestions all matched claimed slots.',
      }));
    }

    // Log usage for the dashboard.
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
    const costUsd = computeHaikuCost({
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
    });

    try {
      await getFirestore().collection('aiUsage').add({
        at: FieldValue.serverTimestamp(),
        by: req.auth?.uid ?? 'unknown',
        kind: 'suggestTeamColor',
        model: MODEL,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        costUsd,
      });
    } catch (err) {
      logger.warn('Could not write aiUsage doc', { err });
    }

    return parsed;
  },
);

function buildPrompt(available: ColorSlot[], excluded: ColorSlot[]): string {
  const availLines = available
    .map((c) => `  - "${c}" (${COLOR_INFO[c].hex}, ${COLOR_INFO[c].description})`)
    .join('\n');
  const excludedLines = excluded.length
    ? `\nALREADY TAKEN by other teams in this event — do NOT recommend:\n${excluded
        .map((c) => `  - "${c}" (${COLOR_INFO[c].hex})`)
        .join('\n')}`
    : '';

  return `You are looking at a sports jersey photo for a company sports fest.
Pick which of the available brand color slots best matches the jersey's
dominant colors. The visual app will use this slot to color the team's
avatar, leaderboard flag, arena dot, and scoreboard.

Available color slots:
${availLines}
${excludedLines}

Return 1–3 suggestions in order from best match to acceptable fallback.
For each, give a one-sentence rationale referring to the actual colors you
see on the jersey. Do not suggest any color from the "already taken" list.`;
}

// Haiku 4.5 rates per million tokens (USD).
const HAIKU_RATES = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };

function computeHaikuCost(args: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  const cost =
    (args.inputTokens * HAIKU_RATES.input) / 1_000_000 +
    (args.outputTokens * HAIKU_RATES.output) / 1_000_000 +
    (args.cacheCreationTokens * HAIKU_RATES.cacheWrite) / 1_000_000 +
    (args.cacheReadTokens * HAIKU_RATES.cacheRead) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

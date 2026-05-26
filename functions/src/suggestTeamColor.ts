/**
 * AI color recommender — looks at a jersey photo and picks which of the
 * available palette colors best matches the jersey's dominant tones.
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

/**
 * Standard team palette. Mirrors `TEAM_PALETTE` in `src/types/team.ts`.
 * Stored value on team docs is the hex string. Keep these in sync if you
 * add or remove entries on the client.
 */
const PALETTE: { hex: string; label: string }[] = [
  { hex: '#ff4a1c', label: 'Lava (warm orange-red, brand accent)' },
  { hex: '#e8ff4a', label: 'Lime (electric neon yellow-green, brand accent)' },
  { hex: '#4ad4ff', label: 'Cyan (bright sky blue, brand accent)' },
  { hex: '#ff4ad0', label: 'Pink (vivid magenta, brand accent)' },
  { hex: '#e63946', label: 'Red (classic jersey red)' },
  { hex: '#1d4ed8', label: 'Royal Blue (deep saturated blue)' },
  { hex: '#16a34a', label: 'Green (kelly / pitch green)' },
  { hex: '#facc15', label: 'Yellow (sunflower / amber)' },
  { hex: '#7c3aed', label: 'Purple (royal violet)' },
  { hex: '#0f766e', label: 'Teal (deep blue-green)' },
  { hex: '#f97316', label: 'Orange (pumpkin / safety orange)' },
  { hex: '#0ea5e9', label: 'Sky (medium azure)' },
  { hex: '#a16207', label: 'Maroon (dark earthy red-brown)' },
  { hex: '#f5f1e8', label: 'White (off-white / cream)' },
  { hex: '#9ca3af', label: 'Silver (light cool grey)' },
  { hex: '#4b5563', label: 'Charcoal (medium grey)' },
  { hex: '#1f2937', label: 'Slate (very dark cool grey)' },
  { hex: '#0b0b0b', label: 'Black (near-pure black)' },
  { hex: '#0c1a3a', label: 'Navy (very dark blue)' },
];

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
        required: ['color', 'rationale', 'source'],
        properties: {
          color: {
            type: 'string',
            // Free-form hex — AI can pick a palette entry OR generate a
            // custom hex that better matches the jersey's actual color.
            // Format validated post-parse, not via JSON-schema (Anthropic
            // structured output doesn't reliably enforce regex on string).
            description:
              '6-digit hex color with leading "#". Must accurately represent the actual fabric color you see on the jersey.',
          },
          source: {
            type: 'string',
            enum: ['palette', 'custom'],
            description:
              '"palette" if you picked an entry from the listed palette; "custom" if you generated a new hex because no palette entry was close enough.',
          },
          rationale: {
            type: 'string',
            description:
              'One-sentence reason this color matches the jersey, referencing the actual colors you see.',
          },
        },
      },
    },
  },
} as const;

type Suggestion = { color: string; rationale: string; source: 'palette' | 'custom' };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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

    const excluded = new Set((excludeColors ?? []).map((c) => c.toLowerCase()));
    const available = PALETTE.filter((p) => !excluded.has(p.hex.toLowerCase()));
    if (available.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Every palette color is already claimed in this event.',
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
      return {
        suggestions: available.slice(0, 2).map((p) => ({
          color: p.hex,
          source: 'palette' as const,
          rationale: 'Stub suggestion (no API key set).',
        })),
      };
    }

    const client = new Anthropic({ apiKey: key });
    const prompt = buildPrompt(available, PALETTE.filter((p) => excluded.has(p.hex.toLowerCase())));

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

    // Defense in depth:
    //  - drop entries that aren't valid 6-digit hex
    //  - drop entries that exactly match a CLAIMED palette slot (case-insensitive)
    // Custom hexes that happen to be close to a claimed slot are allowed —
    // the model is trusted to differentiate when it intentionally veers.
    const excludedHexes = new Set(excluded);
    parsed.suggestions = parsed.suggestions
      .map((s) => ({ ...s, color: s.color.trim() }))
      .filter((s) => HEX_RE.test(s.color))
      .filter((s) => !excludedHexes.has(s.color.toLowerCase()));
    if (parsed.suggestions.length === 0) {
      parsed.suggestions = available.slice(0, 1).map((p) => ({
        color: p.hex,
        source: 'palette' as const,
        rationale: 'Fallback — no usable suggestion from the model.',
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

function buildPrompt(
  available: { hex: string; label: string }[],
  excluded: { hex: string; label: string }[],
): string {
  const availLines = available.map((p) => `  - "${p.hex}" — ${p.label}`).join('\n');
  const excludedLines = excluded.length
    ? `\nALREADY TAKEN by other teams in this event — DO NOT suggest these:\n${excluded
        .map((p) => `  - "${p.hex}" — ${p.label}`)
        .join('\n')}`
    : '';

  return `You are looking at a sports jersey photo for a company sports fest.
Your job is to identify the actual dominant fabric colors of the jersey
and return 1–3 hex values that team uniforms will be themed with.

PROCESS:
1. Look only at the jersey fabric itself. IGNORE: skin, hair, background,
   shadows, lighting tint, logo prints, sleeve trim of a different color.
2. Identify the SINGLE most dominant color of the jersey body — the one
   that covers the largest fabric area. This is suggestion #1.
3. If the jersey clearly has a strong secondary color (e.g. contrasting
   sleeves, large color block), that's suggestion #2. If not, skip.
4. Optional third = a tertiary alternative if the jersey could reasonably
   be themed two different ways.

CHOOSING A HEX FOR EACH SUGGESTION:
- Prefer an entry from the AVAILABLE PALETTE below when one is genuinely
  close to the fabric color (set source: "palette", use the listed hex).
- If NO palette entry is a good match — for example the jersey is a
  specific grey, off-blue, beige, navy, etc. that isn't represented —
  GENERATE a custom 6-digit hex that accurately depicts the fabric color
  (set source: "custom"). Greys especially: a charcoal-grey jersey should
  return a grey hex like #6b7280 or #4b5563, NOT be force-matched to
  Royal Blue or Purple.
- Never describe the jersey color as something it visually isn't.

AVAILABLE PALETTE (good defaults, but you may go custom):
${availLines}
${excludedLines}

CONSTRAINTS:
- Do NOT return any color that exactly matches a hex from the "ALREADY
  TAKEN" list above.
- Each rationale must name the literal fabric color you actually see
  ("dominantly charcoal grey body with white sleeve cuffs" → return
   #4b5563 source:"custom"). One sentence each.
- Return 1–3 suggestions, ordered best→fallback.`;
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

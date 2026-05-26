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
];

const PALETTE_HEXES = PALETTE.map((p) => p.hex);

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
            enum: PALETTE_HEXES,
            description:
              'Hex of the palette entry that best matches the jersey. Must be one of the listed hexes.',
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

type Suggestion = { color: string; rationale: string };

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

    // Defense in depth — strip any suggestion that uses a now-claimed slot
    // (the model shouldn't, given the prompt, but better safe than sorry).
    const availableHexes = new Set(available.map((p) => p.hex.toLowerCase()));
    parsed.suggestions = parsed.suggestions.filter((s) =>
      availableHexes.has(s.color.toLowerCase()),
    );
    if (parsed.suggestions.length === 0) {
      parsed.suggestions = available.slice(0, 1).map((p) => ({
        color: p.hex,
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
Your job is to pick the palette colors that most closely match the jersey's
dominant visible colors — primary first, then secondary if present.

Look at the actual hues on the fabric (ignore shadows, logos, lighting, and
white skin/background). Identify the 1-3 dominant colors of the jersey
itself and match each to the closest available palette entry below.

Available palette (each entry is a hex value and a description):
${availLines}
${excludedLines}

Return 1–3 suggestions ordered from best match (closest hue to the jersey's
primary color) to acceptable fallback. For each, the rationale must name
the actual color you see on the jersey ("the jersey is dominantly cobalt
blue with white sleeves" → suggest Royal Blue). Do NOT suggest any color
from the "already taken" list. If the jersey is multi-color, pick the
dominant block color, not the trim.`;
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

/**
 * AI Rulebook Parser — callable Cloud Function.
 *
 * Input (one of):
 *   { text: string }              — raw rulebook text pasted by admin
 *   { storagePath: string }       — path to a PDF in Firebase Storage; we
 *                                   download + extract text with pdf-parse
 *
 * Output:
 *   { sports: ParsedSport[] }     — see schema below
 *
 * Auth: admin or super-admin (custom claims). Anyone else gets permission-denied.
 *
 * If ANTHROPIC_API_KEY is missing (e.g. local emulator without secrets), the
 * function returns a stub response so the UI is testable end-to-end without
 * burning tokens. The stub clearly flags itself via confidence: 'low' on every
 * field so it isn't mistaken for real output.
 */
import Anthropic from '@anthropic-ai/sdk';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import pdfParse from 'pdf-parse';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Sonnet 4.6 balances quality and cost for structured extraction.
// Bump to claude-opus-4-7 if rulebook parsing quality drops on real inputs.
const MODEL = 'claude-sonnet-4-6';

/**
 * Published per-million-token rates in USD (sourced from
 * platform.claude.com/docs/en/pricing). Keep this table close to the model
 * literal so they drift together if we swap models.
 *
 * cacheWrite = 1.25x input; cacheRead = 0.1x input — derived per Anthropic's
 * prompt-caching pricing structure.
 */
const PRICING_USD_PER_MTOK: Record<string, {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-opus-4-7':   { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-haiku-4-5':  { input: 1, output: 5,  cacheWrite: 1.25, cacheRead: 0.1 },
};

function computeCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  const rates = PRICING_USD_PER_MTOK[args.model];
  if (!rates) return 0;
  const cost =
    (args.inputTokens * rates.input) / 1_000_000 +
    (args.outputTokens * rates.output) / 1_000_000 +
    (args.cacheCreationTokens * rates.cacheWrite) / 1_000_000 +
    (args.cacheReadTokens * rates.cacheRead) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

// JSON schema — guarantees the response shape via output_config.format.
// Anything Claude returns will validate against this; no JSON.parse error path.
const RULEBOOK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sports'],
  properties: {
    sports: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'playersOnField',
          'substitutes',
          'duration',
          'format',
          'points',
          'trackableEvents',
          'arenaType',
          'confidence',
        ],
        properties: {
          name: { type: 'string', description: 'Sport name, e.g. "Football"' },
          playersOnField: {
            type: 'integer',
            description: 'Players per side on the field at one time (>= 1)',
          },
          substitutes: {
            type: 'integer',
            description: 'Max substitutes per side (>= 0)',
          },
          duration: {
            type: 'string',
            description: 'Human duration, e.g. "2 × 15 min" or "best of 3 games"',
          },
          format: {
            type: 'string',
            description: 'Format string, e.g. "5-a-side · roll subs"',
          },
          points: {
            type: 'object',
            additionalProperties: false,
            required: ['win', 'draw', 'loss'],
            properties: {
              win: { type: 'number' },
              draw: { type: 'number' },
              loss: { type: 'number' },
            },
          },
          trackableEvents: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'goal',
                'run',
                'wicket',
                'boundary',
                'six',
                'wide',
                'no-ball',
                'bye',
                'yellow',
                'red',
                'foul',
                'sub',
                'let',
                'fault',
                'service-change',
                'move',
                'draw-offer',
                'resign',
                'timeout',
              ],
            },
          },
          arenaType: {
            type: 'string',
            enum: ['field', 'court', 'pitch', 'board'],
          },
          confidence: {
            type: 'object',
            additionalProperties: false,
            required: [
              'playersOnField',
              'substitutes',
              'duration',
              'format',
              'points',
              'trackableEvents',
              'arenaType',
            ],
            properties: {
              playersOnField: { type: 'string', enum: ['high', 'low', 'missing'] },
              substitutes: { type: 'string', enum: ['high', 'low', 'missing'] },
              duration: { type: 'string', enum: ['high', 'low', 'missing'] },
              format: { type: 'string', enum: ['high', 'low', 'missing'] },
              points: { type: 'string', enum: ['high', 'low', 'missing'] },
              trackableEvents: { type: 'string', enum: ['high', 'low', 'missing'] },
              arenaType: { type: 'string', enum: ['high', 'low', 'missing'] },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You parse company sports-fest rulebooks into structured JSON.

For each sport described in the input, extract:
  - name (string)
  - playersOnField (number on each side at one time)
  - substitutes (max per side; 0 if not mentioned)
  - duration (free-form string, e.g. "2 × 15 min", "best of 3")
  - format (free-form string, e.g. "5-a-side · roll subs")
  - points: { win, draw, loss } — numeric per-match points awarded
  - trackableEvents: array drawn ONLY from this fixed vocabulary:
      goal, run, wicket, boundary, six, wide, no-ball, bye, yellow, red,
      foul, sub, let, fault, service-change, move, draw-offer, resign, timeout
  - arenaType: one of "field" (football, hockey), "court" (badminton, basketball,
    squash, tennis), "pitch" (cricket), "board" (chess, carrom)
  - confidence: per-field confidence: "high" when the rulebook states the value
    directly, "low" when you inferred it, "missing" when the rulebook is silent
    (use a sensible default for the value, but mark confidence as "missing" so
    the admin reviews it)

Use sensible defaults when fields are missing rather than refusing — but always
flag confidence accurately. The admin will review every "low" / "missing" field
before confirming. Never invent sports that aren't in the input.`;

type ParseInput = { text?: string; storagePath?: string };

type ParsedRulebook = {
  sports: Array<Record<string, unknown>>;
};

export const parseRulebook = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (req): Promise<ParsedRulebook> => {
    // Auth gate — only admin or super-admin.
    const claims = req.auth?.token as { admin?: boolean; superAdmin?: boolean } | undefined;
    if (!claims?.admin && !claims?.superAdmin) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }

    const input = (req.data ?? {}) as ParseInput;
    let text: string;

    if (input.text && input.text.trim().length > 0) {
      text = input.text;
    } else if (input.storagePath) {
      text = await extractPdfText(input.storagePath);
    } else {
      throw new HttpsError('invalid-argument', 'Provide either `text` or `storagePath`.');
    }

    if (text.length > 200_000) {
      // Hard cap; the model handles plenty more but bills are bills.
      throw new HttpsError('invalid-argument', 'Rulebook text is too long (>200K chars).');
    }

    const key = ANTHROPIC_API_KEY.value();
    if (!key) {
      logger.warn('ANTHROPIC_API_KEY not set — returning stub.');
      return stubResponse(text);
    }

    return await callAnthropic(key, text, req.auth?.uid ?? 'unknown');
  },
);

async function extractPdfText(storagePath: string): Promise<string> {
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError('not-found', `No file at ${storagePath}`);
  }
  const [buffer] = await file.download();
  const parsed = await pdfParse(buffer);
  const text = parsed.text.trim();
  if (text.length === 0) {
    throw new HttpsError('failed-precondition', 'PDF contained no extractable text (image-only?).');
  }
  return text;
}

async function callAnthropic(
  apiKey: string,
  rulebookText: string,
  byUid: string,
): Promise<ParsedRulebook> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    // Structured extraction doesn't need thinking — the JSON schema enforces
    // output shape, and `effort: low` keeps latency under the 70s callable
    // client timeout. Bump these if extraction quality drops on real inputs.
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: RULEBOOK_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    // System prompt + schema description is identical across every call →
    // cache it. The rulebook text in the user turn is volatile.
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Parse this rulebook:\n\n${rulebookText}`,
      },
    ],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
  const costUsd = computeCostUsd({
    model: MODEL,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
  });

  logger.info('Rulebook parsed', {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUsd,
    stopReason: response.stop_reason,
  });

  // Fire-and-forget ledger write. Failure to log usage shouldn't fail the
  // parse call itself.
  try {
    await getFirestore().collection('aiUsage').add({
      at: FieldValue.serverTimestamp(),
      by: byUid,
      kind: 'parseRulebook',
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

  // With output_config.format the API constrains the response to our schema,
  // but we still need to extract the JSON text from the content blocks.
  if (response.stop_reason === 'refusal') {
    throw new HttpsError('failed-precondition', 'Model refused to parse this rulebook.');
  }
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) {
    throw new HttpsError('internal', 'No text block in response.');
  }
  try {
    return JSON.parse(textBlock.text) as ParsedRulebook;
  } catch (err) {
    logger.error('Could not parse model output as JSON', { text: textBlock.text });
    throw new HttpsError('internal', 'Model returned invalid JSON.');
  }
}

function stubResponse(text: string): ParsedRulebook {
  // Deterministic stub for local emulator testing without an API key.
  // Detects a few sport names by keyword so the UI has something to render.
  const t = text.toLowerCase();
  const sports: ParsedRulebook['sports'] = [];
  if (t.includes('football')) {
    sports.push(stubSport('Football', 5, 3, 'field', '2 × 15 min', '5-a-side'));
  }
  if (t.includes('cricket')) {
    sports.push(stubSport('Cricket', 7, 4, 'pitch', 'T10', '7-a-side'));
  }
  if (t.includes('badminton')) {
    sports.push(stubSport('Badminton', 2, 0, 'court', 'Best of 3', 'Doubles'));
  }
  if (t.includes('chess')) {
    sports.push(stubSport('Chess', 1, 0, 'board', '15 min/side', 'Standard'));
  }
  if (sports.length === 0) {
    sports.push(stubSport('Football', 5, 3, 'field', '2 × 15 min', '5-a-side'));
  }
  return { sports };
}

function stubSport(
  name: string,
  playersOnField: number,
  substitutes: number,
  arenaType: 'field' | 'court' | 'pitch' | 'board',
  duration: string,
  format: string,
): Record<string, unknown> {
  return {
    name,
    playersOnField,
    substitutes,
    duration,
    format,
    points: { win: 3, draw: 1, loss: 0 },
    trackableEvents:
      arenaType === 'field'
        ? ['goal', 'yellow', 'red', 'foul', 'sub']
        : arenaType === 'pitch'
          ? ['run', 'wicket', 'boundary', 'six', 'wide', 'no-ball']
          : arenaType === 'court'
            ? ['goal', 'fault', 'service-change']
            : ['move', 'draw-offer', 'resign', 'timeout'],
    arenaType,
    confidence: {
      playersOnField: 'low',
      substitutes: 'low',
      duration: 'low',
      format: 'low',
      points: 'low',
      trackableEvents: 'low',
      arenaType: 'low',
    },
  };
}

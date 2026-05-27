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

// NOTE — we used to pass `output_config.format = json_schema` here for
// API-enforced JSON output. With 22 confidence fields + 22 sport fields
// nested under an array, Anthropic's grammar compiler started timing out
// ("Grammar compilation timed out"). The schema itself is fine — the
// compilation step is what's slow. So we now switched to prompt-only
// JSON: the system prompt + user message describe the shape the model
// should emit, we strip any markdown fences, and parse the result with
// tolerance for missing fields. The user-facing response shape hasn't
// changed; only the enforcement mechanism did.

const SYSTEM_PROMPT = `You parse company sports-fest rulebooks into structured JSON.

The fest has up to 16 sport events. Many are variants of the same parent
sport (e.g. Badminton has Mixed Doubles, Men's Doubles, Men's Singles,
Women's Singles — each is a separate sport entry with parentCategory:"Badminton").

For each sport described in the input, extract:

  REQUIRED fields:
    name, arenaType, playersOnField, substitutes, duration, format,
    points {win, draw, loss}, trackableEvents (array)

  OPTIONAL — include only when the rulebook supports them:
    category (team | racquet | cue-sport)
    parentCategory (for variants)
    playersToRegister  substitutionRules
    genderRequirement { mandatoryMales?, mandatoryFemales?, notes? }
    overSchedule  officials
    scoringRules[]  bowlingRules[]  fieldingRules[]  gameplayRules[]
    faultsList[]  tieBreakerRules[]  houseRules
    stateFields[]  — the live-match counters this sport needs

  arenaType vocabulary:
    field   — cricket-style open playing area
    pitch   — football pitch with goal box / D
    court   — racquet sport court (badminton, pickleball, tennis)
    table   — TT / pool table
    rope    — tug-of-war
    track   — relay race / athletics track
    board   — chess / carrom

  trackableEvents — free-form strings. Prefer standard vocab when it fits
  (goal, run, wicket, boundary, six, wide, no-ball, bye, yellow, red, foul,
  sub, let, fault, service-change, move, draw-offer, resign, timeout) but
  use custom event names like "run-4", "frame-start", "pull-end" when the
  sport needs them.

  points — if the rulebook is silent on per-match points, default to a
  sensible spread weighted by the sport's effort/duration:
    team sports (cricket, football): win=8-10, draw=3-4, loss=0
    racquet sports: win=6, draw=2, loss=0
    cue / pool: win=5, draw=2, loss=0
  Mark confidence:"missing" when defaulting.

  confidence — per-field "high" | "low" | "missing":
    "high"    rulebook states the value directly
    "low"     inferred from context
    "missing" rulebook silent (still output a sensible default; admin reviews)

Use sensible defaults when fields are missing rather than refusing — but
always flag confidence accurately. Never invent sports that aren't in the
input. If you're unsure whether a sport has variants, prefer creating one
entry per variant (better to over-split than to merge incompatible rules).`;

type ParseInput = { text?: string; storagePath?: string };

type ParsedRulebook = {
  sports: Array<Record<string, unknown>>;
};

export const parseRulebook = onCall(
  // 540s is the max for Gen 2 callables. Sonnet 4.6 with a long
  // multi-sport rulebook can run 60-180s on first request; the previous
  // 120s ceiling was tripping prod uploads. 1GiB memory gives pdf-parse
  // + the SDK comfortable headroom on bigger PDFs.
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '1GiB' },
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

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8_000,
      // We previously used `output_config.format = json_schema` for
      // guaranteed-shape output. With 22 confidence fields + 22 sport
      // fields + a few nested objects, Anthropic's grammar compiler was
      // timing out ("Grammar compilation timed out"). Switching to
      // prompt-only JSON: the system prompt tells the model to emit a
      // JSON object matching a documented shape; we parse + tolerate
      // missing fields downstream. Markdown code-fence stripping
      // already in place if the model wraps the JSON.
      thinking: { type: 'disabled' },
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
          content: `Parse this rulebook and respond with ONLY a JSON object — no preamble, no markdown fences, no commentary. The object must look like:

{
  "sports": [
    {
      "name": "Football",
      "arenaType": "pitch",
      "playersOnField": 5,
      "substitutes": 3,
      "duration": "2 × 15 min",
      "format": "5-a-side",
      "points": { "win": 8, "draw": 3, "loss": 0 },
      "trackableEvents": ["goal","yellow","red","foul","sub"],
      "confidence": { "playersOnField": "high", ... },
      // optional fields — include only when the rulebook supports them:
      "category": "team",
      "parentCategory": "Football",
      "playersToRegister": 8,
      "substitutionRules": "...",
      "scoringRules": ["..."],
      "faultsList": ["..."],
      "tieBreakerRules": ["..."],
      "houseRules": "...",
      "overSchedule": "...",
      "officials": "...",
      "stateFields": ["scoreA","scoreB","clockSeconds"]
    }
  ]
}

Rulebook text:

${rulebookText}`,
        },
      ],
    });
  } catch (err) {
    // Anthropic SDK throws APIError subclasses; surface enough detail
    // for the admin to see what actually broke instead of a bare 500.
    const message = err instanceof Error ? err.message : String(err);
    const anyErr = err as { status?: number; error?: { error?: { message?: string } } };
    const apiMessage = anyErr?.error?.error?.message;
    logger.error('Anthropic API call failed', {
      status: anyErr?.status,
      apiMessage,
      message,
    });
    throw new HttpsError(
      'internal',
      `Anthropic API error: ${apiMessage ?? message}`,
    );
  }

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
    contentBlockTypes: response.content.map((b) => b.type),
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
    logger.error('No text block in response', {
      stopReason: response.stop_reason,
      contentBlockTypes: response.content.map((b) => b.type),
    });
    throw new HttpsError(
      'internal',
      `No text block in model response (stop=${response.stop_reason}, blocks=${response.content
        .map((b) => b.type)
        .join(',')}).`,
    );
  }
  // Some Sonnet variants wrap structured output in markdown code fences
  // even when output_config.format is set. Strip a leading ```json /
  // trailing ``` before parsing so a stray fence doesn't trip JSON.parse.
  const raw = textBlock.text.trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedRulebook;
  } catch (err) {
    logger.error('Could not parse model output as JSON', {
      rawLength: raw.length,
      preview: raw.slice(0, 400),
      stopReason: response.stop_reason,
      parseError: err instanceof Error ? err.message : String(err),
    });
    throw new HttpsError(
      'internal',
      `Model returned invalid JSON (stop=${response.stop_reason}, len=${raw.length}, preview=${raw.slice(0, 200).replace(/[\r\n]+/g, ' ')}).`,
    );
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

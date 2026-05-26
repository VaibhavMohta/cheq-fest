import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { getDocs, limit, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import clsx from 'clsx';
import { Button } from '@/components/shared/Button';
import { storage } from '@/lib/firebase';
import { parseRulebook, type ParsedSport } from '@/lib/parseRulebook';
import { aiUsageCol, sportRef } from '@/lib/db';
import { ARENA_TYPES, TRACKABLE_EVENT_VOCAB, type ArenaType, type Confidence, type TrackableEvent } from '@/types/sport';
import { FormField, TextArea, TextInput } from './FormField';
import { RequireEvent } from './RequireEvent';

const sportsQk = (eventId: string) => ['admin', 'sports', eventId] as const;
const AI_USAGE_QK = ['admin', 'aiUsage'] as const;

export function RulebookTab() {
  return (
    <RequireEvent>
      {(event, eventId) => <RulebookTabInner eventId={eventId} eventName={event.name} />}
    </RequireEvent>
  );
}

function RulebookTabInner({ eventId, eventName }: { eventId: string; eventName: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ParsedSport[]>([]);

  const parse = useMutation({
    mutationFn: async (args: { text?: string; storagePath?: string }) => {
      // `parseRulebook` rejects when both are absent; types narrow on usage.
      if (args.storagePath) return parseRulebook({ storagePath: args.storagePath });
      if (args.text) return parseRulebook({ text: args.text });
      throw new Error('No input.');
    },
    onSuccess: (result) => {
      setDrafts(result.sports);
      void qc.invalidateQueries({ queryKey: AI_USAGE_QK });
    },
  });

  const uploadPdfAndParse = useMutation({
    mutationFn: async (file: File) => {
      const path = `rulebooks/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await uploadBytes(storageRef(storage, path), file, {
        contentType: file.type || 'application/pdf',
      });
      return parseRulebook({ storagePath: path });
    },
    onSuccess: (result) => {
      setDrafts(result.sports);
      void qc.invalidateQueries({ queryKey: AI_USAGE_QK });
    },
  });

  const usage = useQuery({
    queryKey: AI_USAGE_QK,
    queryFn: async () => {
      const snap = await getDocs(query(aiUsageCol, orderBy('at', 'desc'), limit(50)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    // Refresh on every successful parse so the user sees the new entry land.
    staleTime: 10_000,
  });

  const saveAll = useMutation({
    mutationFn: async (sports: ParsedSport[]) => {
      await Promise.all(
        sports.map((s) => {
          const { confidence: _confidence, ...rest } = s;
          return setDoc(
            sportRef(eventId, slugify(s.name)),
            { ...rest, aiConfidence: s.confidence },
            { merge: true },
          );
        }),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sportsQk(eventId) });
      setDrafts([]);
      setText('');
      setPdf(null);
    },
  });

  return (
    <div className="mx-5 flex flex-col gap-5">
      <p className="rounded-xl border border-dashed border-accent-2/40 bg-accent-2/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-accent-2">
        AI parser · Claude Sonnet 4.6 · effort low · structured outputs
      </p>

      <AiUsageStats data={usage.data ?? []} loading={usage.isLoading} />

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          1. Provide rulebook
        </h2>
        <FormField label="Paste rulebook text">
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste rulebook content here. Mention each sport with its players, duration, points, etc."
            className="min-h-[160px]"
          />
        </FormField>
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">— or —</p>
        <FormField label="Upload PDF" hint="Saved to Firebase Storage and parsed server-side.">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs text-ink-dim file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:font-mono file:text-[10px] file:font-bold file:uppercase file:text-bg"
          />
        </FormField>

        <div className="flex gap-2">
          <Button
            type="button"
            disabled={(text.trim().length === 0 && !pdf) || parse.isPending || uploadPdfAndParse.isPending}
            onClick={() => {
              if (pdf) {
                uploadPdfAndParse.mutate(pdf);
              } else {
                parse.mutate({ text });
              }
            }}
          >
            {parse.isPending || uploadPdfAndParse.isPending ? 'Parsing…' : 'Parse with AI'}
          </Button>
        </div>

        {(parse.error || uploadPdfAndParse.error) && (
          <ErrorBox detail={String(parse.error ?? uploadPdfAndParse.error)} />
        )}
      </section>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            2. Review & save ({drafts.length} sport{drafts.length === 1 ? '' : 's'})
          </h2>
          {drafts.map((draft, idx) => (
            <SportDraftCard
              key={`${draft.name}-${idx}`}
              draft={draft}
              onChange={(next) =>
                setDrafts((all) => all.map((d, i) => (i === idx ? next : d)))
              }
              onRemove={() => setDrafts((all) => all.filter((_, i) => i !== idx))}
            />
          ))}
          <Button
            type="button"
            disabled={saveAll.isPending}
            onClick={() => saveAll.mutate(drafts)}
          >
            {saveAll.isPending
              ? 'Saving…'
              : `Save ${drafts.length} sport${drafts.length === 1 ? '' : 's'} → ${eventName}`}
          </Button>
          {saveAll.error && <ErrorBox detail={String(saveAll.error)} />}
        </section>
      )}
    </div>
  );
}

function SportDraftCard({
  draft,
  onChange,
  onRemove,
}: {
  draft: ParsedSport;
  onChange: (next: ParsedSport) => void;
  onRemove: () => void;
}) {
  const c = draft.confidence;
  const hasMissing = Object.values(c).some((v) => v === 'missing');
  const hasLow = Object.values(c).some((v) => v === 'low');

  return (
    <div
      className="rounded-2xl border bg-bg-card p-3"
      style={{
        borderColor: hasMissing
          ? 'color-mix(in oklab, var(--accent) 50%, transparent)'
          : hasLow
            ? 'color-mix(in oklab, var(--gold) 50%, transparent)'
            : 'var(--line)',
      }}
    >
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="flex-1 bg-transparent font-display text-lg uppercase tracking-[0.06em] outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
        >
          Remove
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <FieldRow
          label="Players on field"
          confidence={c.playersOnField}
          onConfidence={(v) => onChange({ ...draft, confidence: { ...c, playersOnField: v } })}
        >
          <TextInput
            type="number"
            min={1}
            value={draft.playersOnField}
            onChange={(e) => onChange({ ...draft, playersOnField: Math.max(1, Number(e.target.value) || 1) })}
          />
        </FieldRow>
        <FieldRow
          label="Substitutes"
          confidence={c.substitutes}
          onConfidence={(v) => onChange({ ...draft, confidence: { ...c, substitutes: v } })}
        >
          <TextInput
            type="number"
            min={0}
            value={draft.substitutes}
            onChange={(e) => onChange({ ...draft, substitutes: Math.max(0, Number(e.target.value) || 0) })}
          />
        </FieldRow>
        <FieldRow
          label="Duration"
          confidence={c.duration}
          onConfidence={(v) => onChange({ ...draft, confidence: { ...c, duration: v } })}
        >
          <TextInput
            value={draft.duration}
            onChange={(e) => onChange({ ...draft, duration: e.target.value })}
          />
        </FieldRow>
        <FieldRow
          label="Format"
          confidence={c.format}
          onConfidence={(v) => onChange({ ...draft, confidence: { ...c, format: v } })}
        >
          <TextInput
            value={draft.format}
            onChange={(e) => onChange({ ...draft, format: e.target.value })}
          />
        </FieldRow>
        <FieldRow
          label="Arena"
          confidence={c.arenaType}
          onConfidence={(v) => onChange({ ...draft, confidence: { ...c, arenaType: v } })}
        >
          <select
            value={draft.arenaType}
            onChange={(e) => onChange({ ...draft, arenaType: e.target.value as ArenaType })}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase focus:border-accent focus:outline-none"
          >
            {ARENA_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>

      <div className="mt-3">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
          Points {pill(c.points)}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <TextInput
            type="number"
            min={0}
            value={draft.points.win}
            onChange={(e) => onChange({ ...draft, points: { ...draft.points, win: Number(e.target.value) || 0 } })}
          />
          <TextInput
            type="number"
            min={0}
            value={draft.points.draw}
            onChange={(e) => onChange({ ...draft, points: { ...draft.points, draw: Number(e.target.value) || 0 } })}
          />
          <TextInput
            type="number"
            min={0}
            value={draft.points.loss}
            onChange={(e) => onChange({ ...draft, points: { ...draft.points, loss: Number(e.target.value) || 0 } })}
          />
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
          Trackable events {pill(c.trackableEvents)}
        </p>
        <div className="flex flex-wrap gap-1">
          {TRACKABLE_EVENT_VOCAB.map((evt) => {
            const active = draft.trackableEvents.includes(evt);
            return (
              <button
                key={evt}
                type="button"
                onClick={() => {
                  const next = active
                    ? draft.trackableEvents.filter((e) => e !== evt)
                    : ([...draft.trackableEvents, evt] as TrackableEvent[]);
                  onChange({ ...draft, trackableEvents: next });
                }}
                className={clsx(
                  'rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]',
                  active ? 'border-accent bg-accent text-bg' : 'border-line bg-bg text-ink-dim',
                )}
              >
                {evt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  confidence,
  onConfidence,
  children,
}: {
  label: string;
  confidence: Confidence;
  onConfidence: (next: Confidence) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</span>
        <ConfidencePill value={confidence} onChange={onConfidence} />
      </div>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function ConfidencePill({
  value,
  onChange,
}: {
  value: Confidence;
  onChange: (next: Confidence) => void;
}) {
  const colors: Record<Confidence, string> = {
    high: 'var(--accent-2)',
    low: 'var(--gold)',
    missing: 'var(--accent)',
  };
  const next: Record<Confidence, Confidence> = {
    high: 'low',
    low: 'missing',
    missing: 'high',
  };
  return (
    <button
      type="button"
      onClick={() => onChange(next[value])}
      className="rounded-md border px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]"
      style={{
        color: colors[value],
        borderColor: 'color-mix(in oklab, currentColor 40%, transparent)',
      }}
      title="Tap to cycle confidence"
    >
      {value}
    </button>
  );
}

function pill(value: Confidence): React.ReactNode {
  const colors: Record<Confidence, string> = {
    high: 'var(--accent-2)',
    low: 'var(--gold)',
    missing: 'var(--accent)',
  };
  return (
    <span
      className="ml-1 rounded-md border px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]"
      style={{ color: colors[value], borderColor: 'color-mix(in oklab, currentColor 40%, transparent)' }}
    >
      {value}
    </span>
  );
}

function ErrorBox({ detail }: { detail: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent"
    >
      {detail}
    </p>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

type AiUsageRow = {
  id: string;
  at?: Timestamp;
  by?: string;
  kind?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
};

function AiUsageStats({ data, loading }: { data: AiUsageRow[]; loading: boolean }) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-bg-card px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">AI Cost</p>
        <p className="mt-1 text-xs text-ink-mute">Loading usage…</p>
      </section>
    );
  }

  const totals = data.reduce(
    (acc, r) => ({
      calls: acc.calls + 1,
      input: acc.input + (r.inputTokens ?? 0),
      output: acc.output + (r.outputTokens ?? 0),
      cacheRead: acc.cacheRead + (r.cacheReadTokens ?? 0),
      cacheCreate: acc.cacheCreate + (r.cacheCreationTokens ?? 0),
      cost: acc.cost + (r.costUsd ?? 0),
    }),
    { calls: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0 },
  );

  return (
    <section className="rounded-2xl border border-line bg-bg-card p-4">
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">AI Cost</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
          last 50 calls
        </p>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Total spend" value={`$${totals.cost.toFixed(4)}`} accent="var(--accent-2)" />
        <Stat label="Calls" value={String(totals.calls)} />
        <Stat label="Total tokens" value={formatTokens(totals.input + totals.output)} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat label="Input" value={formatTokens(totals.input)} small />
        <Stat label="Output" value={formatTokens(totals.output)} small />
        {totals.cacheRead > 0 && (
          <Stat label="Cache read" value={formatTokens(totals.cacheRead)} small />
        )}
        {totals.cacheCreate > 0 && (
          <Stat label="Cache write" value={formatTokens(totals.cacheCreate)} small />
        )}
      </div>

      {data.length > 0 && (
        <details className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
            Recent calls ({Math.min(data.length, 5)})
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {data.slice(0, 5).map((r) => (
              <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-1.5">
                <span className="font-mono text-[10px] tabular-nums text-ink-dim">
                  {formatTime(r.at)}
                </span>
                <span className="truncate font-mono text-[10px] text-ink-dim">
                  {r.kind} · {r.model}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-accent-2">
                  ${(r.costUsd ?? 0).toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.length === 0 && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          No AI calls yet · run a parse to see usage
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">{label}</p>
      <p
        className={clsx(
          'mt-0.5 font-display tabular-nums',
          small ? 'text-base' : 'text-xl',
        )}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

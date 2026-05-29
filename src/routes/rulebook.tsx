import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { useActiveEvent } from '@/lib/activeEvent';
import { sportsCol } from '@/lib/db';
import type { SportDoc } from '@/types/sport';
import { SportIcon } from '@/components/shared/SportIcon';

export const Route = createFileRoute('/rulebook')({
  component: RulebookScreen,
});

type SportWithId = SportDoc & { id: string };

function RulebookScreen() {
  const { event, activeEventId } = useActiveEvent();
  const [sports, setSports] = useState<SportWithId[]>([]);

  useEffect(() => {
    if (!activeEventId) {
      setSports([]);
      return;
    }
    return onSnapshot(
      query(sportsCol(activeEventId), orderBy('name')),
      (snap) => setSports(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setSports([]),
    );
  }, [activeEventId]);

  const pdfUrl = event?.rulebookPdfUrl ?? null;
  const parsedAt = event?.rulebookParsedAt?.toDate() ?? null;
  const pdfMeta = pdfUrl
    ? {
        title: event?.name ? `${event.name} — Rulebook` : 'CHEQ Fest — Rulebook',
        meta: parsedAt
          ? `Parsed ${parsedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'Uploaded · awaiting parse',
      }
    : null;

  return (
    <>
      <TopBar title="The Rulebook" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />
        <a
          href={pdfUrl ?? undefined}
          target={pdfUrl ? '_blank' : undefined}
          rel={pdfUrl ? 'noopener noreferrer' : undefined}
          aria-disabled={!pdfUrl}
          onClick={(e) => {
            if (!pdfUrl) e.preventDefault();
          }}
          className="mx-5 mb-4 flex items-center gap-4 rounded-2xl border border-line p-5 transition active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card), var(--bg-elev))',
            opacity: pdfUrl ? 1 : 0.65,
            cursor: pdfUrl ? 'pointer' : 'default',
          }}
        >
          <span
            aria-hidden
            className="grid h-16 w-14 shrink-0 place-items-center rounded-lg bg-accent font-display text-xs text-bg"
          >
            PDF
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {pdfMeta?.title ?? 'CHEQ Fest — Rulebook'}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              {pdfMeta?.meta ?? 'Not uploaded yet'}
            </p>
          </div>
          {pdfUrl && (
            <span aria-hidden className="font-mono text-[14px] text-ink-mute">
              ↗
            </span>
          )}
        </a>

        <SectionTitle>Points System</SectionTitle>
        {sports.length === 0 ? (
          <EmptyState
            title="No sports parsed"
            hint="Admin uploads the rulebook PDF and AI parses sport configs + points."
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-2">
            {sports.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-4 py-2.5"
              >
                <SportIcon
                  sportName={s.name}
                  arenaType={s.arenaType}
                  size={24}
                />
                <span className="flex-1 truncate font-display text-sm uppercase">
                  {s.name}
                </span>
                <PointsTriple points={s.points} />
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>Quick Rules</SectionTitle>
        {sports.length === 0 ? (
          <EmptyState
            title="Nothing to read yet"
            hint="Sport summaries appear here after the admin confirms the parsed rulebook."
          />
        ) : (
          <div className="mx-5 flex flex-col gap-3">
            {sports.map((s) => (
              <SportQuickRules key={s.id} sport={s} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function PointsTriple({ points }: { points: SportDoc['points'] }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]">
      <Pill label="W" value={points.win} color="var(--accent-2)" />
      <Pill label="D" value={points.draw} color="var(--ink-dim)" />
      <Pill label="L" value={points.loss} color="var(--ink-mute)" />
    </span>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5" style={{ borderColor: 'var(--line)' }}>
      <span style={{ color }}>{label}</span>
      <span className="text-ink">{value}</span>
    </span>
  );
}

function SportQuickRules({ sport }: { sport: SportWithId }) {
  // Collapse the parsed-rulebook bullet arrays into one stream so the
  // user gets the most important bits without leaving Home. Cap each
  // section to the first three lines — full text lives in the parsed PDF.
  const summary: { label: string; items: string[] }[] = [];
  if (sport.scoringRules?.length) summary.push({ label: 'Scoring', items: sport.scoringRules.slice(0, 3) });
  if (sport.faultsList?.length) summary.push({ label: 'Faults', items: sport.faultsList.slice(0, 3) });
  if (sport.tieBreakerRules?.length)
    summary.push({ label: 'Tie-breakers', items: sport.tieBreakerRules.slice(0, 3) });

  return (
    <article className="rounded-2xl border border-line bg-bg-card px-4 py-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base uppercase">
          <SportIcon sportName={sport.name} arenaType={sport.arenaType} size={22} />
          {sport.name}
        </h3>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
          {sport.format || sport.duration || '—'}
        </p>
      </header>
      {summary.length === 0 ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          No rules parsed for this sport yet.
        </p>
      ) : (
        summary.map((block) => (
          <div key={block.label} className="mt-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
              {block.label}
            </p>
            <ul className="mt-0.5 list-disc pl-4 text-[12px] text-ink">
              {block.items.map((item, i) => (
                <li key={i} className="leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </article>
  );
}

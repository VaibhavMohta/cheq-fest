import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { MenuIcon } from '@/components/shared/icons';
import { useActiveEvent } from '@/lib/activeEvent';
import { sportsCol, teamsCol } from '@/lib/db';
import type { Timestamp } from 'firebase/firestore';

export const Route = createFileRoute('/')({
  component: HomeScreen,
});

const liveMatches: never[] = [];
const todaysMatches: never[] = [];
const standings: never[] = [];

function HomeScreen() {
  return (
    <>
      <TopBar
        title="CHEQ Fest"
        actions={
          <IconButton aria-label="Menu">
            <MenuIcon />
          </IconButton>
        }
      />
      <main className="mx-auto max-w-[420px] pb-28">
        <InstallPrompt />
        <Hero />

        <SectionTitle trailing={liveMatches.length === 0 ? undefined : 'ALL →'}>
          Live Now
        </SectionTitle>
        {liveMatches.length === 0 ? (
          <EmptyState
            title="No live matches"
            hint="Live cards appear here the moment a referee starts a match."
          />
        ) : null}

        <SectionTitle>Today</SectionTitle>
        {todaysMatches.length === 0 ? (
          <EmptyState
            title="Schedule not posted"
            hint="Admin will publish the match schedule once teams are confirmed."
          />
        ) : null}

        <SectionTitle trailing={<Link to="/leaderboard">FULL BOARD →</Link>}>
          Standings
        </SectionTitle>
        {standings.length === 0 ? (
          <EmptyState
            title="No scores yet"
            hint="Standings update automatically as matches finish."
          />
        ) : null}

        <SectionTitle trailing={<Link to="/rulebook">OPEN →</Link>}>The Rulebook</SectionTitle>
        <Link
          to="/rulebook"
          className="mx-5 flex items-center gap-4 rounded-2xl border border-line bg-bg-card px-4 py-4 active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="grid h-12 w-14 place-items-center rounded-lg bg-accent font-display text-xs text-bg"
          >
            PDF
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Rules & Points</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              Sport configs + scoring · always up to date
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">
            →
          </span>
        </Link>
      </main>
    </>
  );
}

function Hero() {
  const { event, activeEventId, loading } = useActiveEvent();

  // Live counts for the active event. Subscribed to so the numbers
  // flip up the moment an admin imports sports or assigns players to
  // teams — no hard refresh needed.
  const [sportCount, setSportCount] = useState<number | null>(null);
  const [teams, setTeams] = useState<{ members: string[] }[]>([]);

  useEffect(() => {
    if (!activeEventId) {
      setSportCount(null);
      setTeams([]);
      return;
    }
    const unsubS = onSnapshot(
      sportsCol(activeEventId),
      (snap) => setSportCount(snap.size),
      () => setSportCount(null),
    );
    const unsubT = onSnapshot(
      teamsCol(activeEventId),
      (snap) =>
        setTeams(snap.docs.map((d) => ({ members: d.data().members ?? [] }))),
      () => setTeams([]),
    );
    return () => {
      unsubS();
      unsubT();
    };
  }, [activeEventId]);

  // Distinct player count = union of every team's members[]. Avoids
  // double-counting if the same email somehow ends up on two teams
  // (shouldn't happen — guarded by the picker — but cheap to be safe).
  const playerCount = (() => {
    const seen = new Set<string>();
    for (const t of teams) {
      for (const m of t.members) seen.add(m.toLowerCase());
    }
    return seen.size;
  })();
  const teamCount = teams.length;

  // Dates label — render real date range when both are set, else "Dates TBA".
  const dateLine = formatEventDates(
    event?.startDate ?? null,
    event?.endDate ?? null,
  );

  // Status label drives the small chip above the title.
  const statusLabel = loading
    ? 'Loading…'
    : !event
      ? 'No active event'
      : event.status === 'live'
        ? 'Live · in progress'
        : event.status === 'ended'
          ? 'Ended · scores final'
          : 'Pre-event · setup in progress';

  // Event name display. The accent-coloured year suffix (e.g. " '26")
  // is split off so it tints separately like the prototype.
  const { primary: nameMain, accent: nameAccent } = splitEventName(
    event?.name ?? 'CHEQ Sports',
    event?.year ?? null,
  );

  return (
    <section
      className="mx-5 mt-2 overflow-hidden rounded-[28px] border border-line p-6"
      style={{
        background:
          'radial-gradient(ellipse at top right, color-mix(in oklab, var(--accent-2) 15%, transparent), transparent 50%), linear-gradient(135deg, #1a1815, #0f0e0c)',
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
        {statusLabel}
      </p>
      <h2 className="mt-3 font-display text-[52px] leading-none uppercase">
        {nameMain}
        {nameAccent && (
          <>
            {' '}
            <span className="text-accent">{nameAccent}</span>
          </>
        )}
      </h2>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
        {dateLine} · {event?.venue || 'Venue TBA'}
      </p>
      <div className="mt-5 flex gap-6">
        <Stat
          value={sportCount === null ? '—' : String(sportCount)}
          label="Sports"
        />
        <Stat value={String(teamCount)} label="Teams" />
        <Stat value={String(playerCount)} label="Players" />
      </div>
    </section>
  );
}

function formatEventDates(
  start: Timestamp | null,
  end: Timestamp | null,
): string {
  if (!start || !end) return 'Dates TBA';
  const s = start.toDate();
  const e = end.toDate();
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric' });
  const fmtMonth = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const fmtYear = (d: Date) => d.getFullYear().toString();
  if (sameMonth) {
    return `${fmtDay(s)}–${fmtDay(e)} ${fmtMonth(s)} ${fmtYear(s)}`;
  }
  if (sameYear) {
    return `${fmtDay(s)} ${fmtMonth(s)} – ${fmtDay(e)} ${fmtMonth(e)} ${fmtYear(s)}`;
  }
  return `${fmtDay(s)} ${fmtMonth(s)} ${fmtYear(s)} – ${fmtDay(e)} ${fmtMonth(e)} ${fmtYear(e)}`;
}

/**
 * Split "CHEQ Sports 2026" → main "CHEQ Sports", accent " '26" so the
 * year displays in accent-orange. If the event name already includes a
 * year-like suffix, keep it intact and don't double-up.
 */
function splitEventName(
  name: string,
  year: number | null,
): { primary: string; accent: string } {
  const m = name.match(/^(.*?)\s+(\d{2,4}|'?\d{2})\s*$/);
  if (m && m[1] && m[2]) {
    const yr = m[2].startsWith("'") ? m[2] : `'${m[2].slice(-2)}`;
    return { primary: m[1].trim(), accent: yr };
  }
  if (year) {
    return { primary: name, accent: `'${String(year).slice(-2)}` };
  }
  return { primary: name, accent: '' };
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
    </div>
  );
}

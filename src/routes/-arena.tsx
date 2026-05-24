import { useState } from 'react';
import clsx from 'clsx';
import { TopBar } from '@/components/shared/TopBar';
import { Field } from '@/components/arena/Field';
import { ArenaPlayer, ArenaEmptySlot } from '@/components/arena/ArenaPlayer';
import { Ball } from '@/components/arena/Ball';
import { ArenaScoreStrip } from '@/components/arena/ArenaScoreStrip';
import { awayPositions, homePositions } from '@/lib/arenaLayout';
import type { ArenaType } from '@/types/sport';
import type { TeamId } from '@/types/team';


type DemoMatch = {
  id: string;
  label: string;
  arena: ArenaType;
  teamA: { teamId: TeamId; players: { name: string; isCaptain?: boolean }[] };
  teamB: { teamId: TeamId; players: { name: string; isCaptain?: boolean }[] };
  scoreA: number;
  scoreB: number;
  clock: string;
};

// Step 9 ships the arena visuals; live data binding happens once matches
// exist (step 10 + step 11). For now, swappable demo matches let us
// inspect every arenaType.
const DEMO_MATCHES: DemoMatch[] = [
  {
    id: 'football',
    label: 'Football · 5-a-side',
    arena: 'field',
    scoreA: 2,
    scoreB: 1,
    clock: "12'",
    teamA: {
      teamId: 'tridents',
      players: [
        { name: 'Shah Mehta', isCaptain: true },
        { name: 'Ravi Bose' },
        { name: 'Arjun Singh' },
        { name: 'Diya Roy' },
        { name: 'Kabir Lal' },
      ],
    },
    teamB: {
      teamId: 'phantoms',
      players: [
        { name: 'Nia Verma', isCaptain: true },
        { name: 'Ira Khanna' },
        { name: 'Sam Pillai' },
        { name: 'Vik Patel' },
        { name: 'Mira Iyer' },
      ],
    },
  },
  {
    id: 'badminton',
    label: 'Badminton · Doubles',
    arena: 'court',
    scoreA: 18,
    scoreB: 16,
    clock: 'G2',
    teamA: {
      teamId: 'blazers',
      players: [
        { name: 'Tara Kale', isCaptain: true },
        { name: 'Aman Joshi' },
      ],
    },
    teamB: {
      teamId: 'voltron',
      players: [
        { name: 'Reha Das', isCaptain: true },
        { name: 'Karan Mukherjee' },
      ],
    },
  },
  {
    id: 'cricket',
    label: 'Cricket · T10',
    arena: 'pitch',
    scoreA: 84,
    scoreB: 0,
    clock: '9.4',
    teamA: {
      teamId: 'tridents',
      players: [
        { name: 'Shah Mehta', isCaptain: true },
        { name: 'Ravi Bose' },
        { name: 'Arjun Singh' },
        { name: 'Diya Roy' },
        { name: 'Kabir Lal' },
        { name: 'Vik Patel' },
        { name: 'Mira Iyer' },
      ],
    },
    teamB: {
      teamId: 'phantoms',
      players: [
        { name: 'Nia Verma', isCaptain: true },
        { name: 'Ira Khanna' },
        { name: 'Sam Pillai' },
        { name: 'Lia Bose' },
      ],
    },
  },
  {
    id: 'chess',
    label: 'Chess · Match',
    arena: 'board',
    scoreA: 0,
    scoreB: 0,
    clock: '24:31',
    teamA: { teamId: 'blazers', players: [{ name: 'Ayan Roy', isCaptain: true }] },
    teamB: { teamId: 'voltron', players: [{ name: 'Maya Lin', isCaptain: true }] },
  },
];

export default function ArenaScreen() {
  const [matchIdx, setMatchIdx] = useState(0);
  const match = DEMO_MATCHES[matchIdx]!;

  const homeSlots = homePositions(match.arena, match.teamA.players.length);
  const awaySlots = awayPositions(match.arena, match.teamB.players.length);

  return (
    <>
      <TopBar title="Live Arena" />
      <main className="mx-auto max-w-[420px] pb-28">
        <div className="mx-5 mb-3 flex gap-1.5 overflow-x-auto">
          {DEMO_MATCHES.map((m, i) => {
            const active = i === matchIdx;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMatchIdx(i)}
                className={clsx(
                  'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition',
                  active
                    ? 'border-accent bg-accent text-bg'
                    : 'border-line bg-bg-card text-ink-dim',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <ArenaScoreStrip
          teamA={match.teamA.teamId}
          teamB={match.teamB.teamId}
          scoreA={match.scoreA}
          scoreB={match.scoreB}
          clock={match.clock}
        />

        <Field arena={match.arena}>
          {match.teamA.players.map((p, i) => {
            const pos = homeSlots[i];
            if (!pos) return <ArenaEmptySlot key={`a-empty-${i}`} position={{ x: 50, y: 50 }} />;
            return (
              <ArenaPlayer
                key={`a-${i}`}
                position={pos}
                name={p.name}
                teamId={match.teamA.teamId}
                isCaptain={p.isCaptain}
                size={match.arena === 'board' ? 64 : 38}
                delaySeed={i}
              />
            );
          })}
          {match.teamB.players.map((p, i) => {
            const pos = awaySlots[i];
            if (!pos) return <ArenaEmptySlot key={`b-empty-${i}`} position={{ x: 50, y: 50 }} />;
            return (
              <ArenaPlayer
                key={`b-${i}`}
                position={pos}
                name={p.name}
                teamId={match.teamB.teamId}
                isCaptain={p.isCaptain}
                size={match.arena === 'board' ? 64 : 38}
                delaySeed={i + 100}
              />
            );
          })}
          <Ball arena={match.arena} />
        </Field>

        <p className="mx-5 mt-3 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">
          Demo · live match data lands with step 10/11
        </p>
      </main>
    </>
  );
}

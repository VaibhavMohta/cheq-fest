import { TopBar } from '@/components/shared/TopBar';
import { LineupBoard } from '@/components/lineup/LineupBoard';
import type { LineupPlayer, LineupSport, LineupState } from '@/lib/lineup';


// Demo dataset — used until step 8 lands and admin imports real players.
// Replace this with a Firestore subscription on
// `events/{e}/teams/{teamId}/rosters/{sportId}` + the team's members.
const DEMO_SPORT: LineupSport = {
  id: 'football',
  name: 'Football',
  playersOnField: 5,
  substitutes: 3,
  format: '5-a-side · 2 × 15 min · roll subs',
};

const DEMO_PLAYERS: readonly LineupPlayer[] = [
  { uid: 'p1', name: 'Shah Mehta', teamId: 'tridents', isCaptain: true },
  { uid: 'p2', name: 'Ravi Bose', teamId: 'tridents', isCaptain: false, sportCapOf: 'football' },
  { uid: 'p3', name: 'Arjun Singh', teamId: 'tridents', isCaptain: false },
  { uid: 'p4', name: 'Diya Roy', teamId: 'tridents', isCaptain: false },
  { uid: 'p5', name: 'Kabir Lal', teamId: 'tridents', isCaptain: false },
  { uid: 'p6', name: 'Nia Verma', teamId: 'tridents', isCaptain: false },
  { uid: 'p7', name: 'Vik Patel', teamId: 'tridents', isCaptain: false },
  { uid: 'p8', name: 'Mira Iyer', teamId: 'tridents', isCaptain: false },
];

const DEMO_INITIAL: LineupState = {
  pitch: ['p1', 'p2', 'p3', 'p4', 'p5'],
  tentative: ['p6'],
  substitutes: ['p7'],
  notPlaying: ['p8'],
};

export default function LineupScreen() {
  return (
    <>
      <TopBar title="Edit Lineup" />
      <main className="mx-auto max-w-[420px] pb-28">
        <div
          className="mx-5 mb-3 rounded-xl border border-dashed px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
          style={{
            color: 'var(--accent-2)',
            borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
            background: 'color-mix(in oklab, var(--accent-2) 6%, transparent)',
          }}
        >
          Demo data · live wiring lands in step 8
        </div>

        <LineupBoard
          sport={DEMO_SPORT}
          players={DEMO_PLAYERS}
          initial={DEMO_INITIAL}
          onChange={(next, ctx) => {
            // Local-only for now. When Firestore is wired:
            //   await setDoc(rosterRef, { ...next }, { merge: true });
            // Returning a rejected promise here reverts the board.
            console.info('lineup change', ctx, next);
          }}
        />
      </main>
    </>
  );
}

import clsx from 'clsx';
import { Chip, type ChipVariant } from '@/components/shared/Chip';
import { colorVarFor, type TeamId } from '@/types/team';
import type { MatchStatus } from '@/types/match';

export type SwitcherMatch = {
  id: string;
  teamAId: TeamId;
  teamBId: TeamId;
  /** Resolved display names + stored colors threaded from the parent.
   *  Caller looks these up from the loaded team docs; the switcher never
   *  invents a name from the raw id. */
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  sportId: string;
  status: MatchStatus;
};

type Props = {
  matches: readonly SwitcherMatch[];
  current: string;
  onChange: (id: string) => void;
};

export function MatchSwitcher({ matches, current, onChange }: Props) {
  if (matches.length === 0) return null;
  return (
    <div className="mx-5 mb-3 flex gap-2 overflow-x-auto pb-1">
      {matches.map((m) => {
        const active = m.id === current;
        const variant: ChipVariant =
          m.status === 'live' ? 'live' : m.status === 'final' ? 'done' : 'upcoming';
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={clsx(
              'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 transition',
              active ? 'border-accent bg-bg-elev' : 'border-line bg-bg-card',
            )}
          >
            <span className="flex items-center gap-1">
              <Dot color={colorVarFor(m.teamAColor)} />
              <span className="font-display text-[11px] uppercase tracking-[0.06em]">
                {m.teamAName.slice(0, 3).toUpperCase()}
              </span>
              <span className="font-mono text-[9px] text-ink-mute">vs</span>
              <span className="font-display text-[11px] uppercase tracking-[0.06em]">
                {m.teamBName.slice(0, 3).toUpperCase()}
              </span>
              <Dot color={colorVarFor(m.teamBColor)} />
            </span>
            <Chip variant={variant}>
              {m.status === 'live' ? 'Live' : m.status === 'final' ? 'Final' : 'Sched'}
            </Chip>
          </button>
        );
      })}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

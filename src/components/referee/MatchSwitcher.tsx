import clsx from 'clsx';
import type { Timestamp } from 'firebase/firestore';
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
  /** Display name of the sport (e.g. "Badminton — Men's Singles").
   *  Caller resolves from the sport doc; falls back to sportId. */
  sportName?: string;
  status: MatchStatus;
  /** Scheduled start time; null for unscheduled. Used by the switcher
   *  to show "10:30" / "Tue 10:30" etc., and by the parent to sort
   *  pills in ascending time order. */
  scheduledStart?: Timestamp | null;
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
              'flex shrink-0 flex-col gap-1 rounded-2xl border px-3 py-2 text-left transition',
              active ? 'border-accent bg-bg-elev' : 'border-line bg-bg-card',
            )}
          >
            {/* Sport name + start time on the top row — small mono label so
                viewers see "what" and "when" before the team matchup. */}
            <span className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
              <span className="max-w-[160px] truncate">
                {m.sportName ?? m.sportId}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMatchTime(m.scheduledStart ?? null)}
              </span>
            </span>
            {/* Team-vs-team + status chip on the bottom row. */}
            <span className="flex items-center gap-2">
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
                {m.status === 'live' ? 'Live' : m.status === 'final' ? 'Ended' : 'Sched'}
              </Chip>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact time label for the switcher pill. Today → "10:30". Other days
 * within the event → "Tue 10:30". Unscheduled → em-dash placeholder.
 */
function formatMatchTime(ts: Timestamp | null): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hhmm = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (sameDay) return hhmm;
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${hhmm}`;
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

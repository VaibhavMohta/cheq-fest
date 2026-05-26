import { Timestamp } from 'firebase/firestore';
import clsx from 'clsx';
import type { TeamId } from '@/types/team';
import type { RefereeEventDoc } from '@/types/match';

type LogEntry = RefereeEventDoc & { id: string };

type Props = {
  events: readonly LogEntry[];
  teamA: TeamId;
  teamB: TeamId;
  /** Display name of team A. Falls back to raw teamId if not provided. */
  teamAName?: string;
  teamBName?: string;
  onUndo: (id: string) => void;
  /** Currently signed-in referee uid — events by others render with attribution. */
  meUid: string | null;
};

export function EventLog({ events, teamA, teamB, teamAName, teamBName, onUndo, meUid }: Props) {
  const nameFor = (side: 'A' | 'B'): string =>
    side === 'A' ? teamAName ?? teamA : teamBName ?? teamB;
  return (
    <section className="mx-5 mb-24 rounded-2xl border border-line bg-bg-card">
      <header className="border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          Event log · {events.filter((e) => !e.undone).length} live
        </span>
      </header>
      {events.length === 0 ? (
        <p className="px-3 py-4 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-ink-mute">
          No events yet · tap a button above
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li
              key={e.id}
              className={clsx(
                'flex items-center gap-2 px-3 py-2',
                e.undone && 'opacity-40',
              )}
            >
              <span className="font-mono text-[9px] tabular-nums text-ink-dim">
                {formatTime(e.at)}
              </span>
              <span className="flex-1 truncate font-mono text-[11px]">
                <span className={clsx('uppercase tracking-[0.06em]', e.undone && 'line-through')}>
                  {e.type}
                </span>
                {e.value !== null && <span className="text-ink-dim"> · {e.value}</span>}
                {e.side && (
                  <span className="text-ink-dim">
                    {' · '}
                    {nameFor(e.side)}
                  </span>
                )}
                {meUid && e.by !== meUid && (
                  <span className="ml-1 text-ink-mute">· {e.by.slice(0, 6)}</span>
                )}
              </span>
              {!e.undone && (
                <button
                  type="button"
                  onClick={() => onUndo(e.id)}
                  className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
                >
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTime(ts: Timestamp): string {
  if (!(ts instanceof Timestamp)) return '—';
  const d = ts.toDate();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

import clsx from 'clsx';
import type { TrackableEvent } from '@/types/sport';
import { colorVarFor, teamLabelFor, type TeamId } from '@/types/team';

type Side = 'A' | 'B';

type Props = {
  teamA: TeamId;
  teamB: TeamId;
  trackable: readonly TrackableEvent[];
  /** Cricket-style numeric runs. Passed separately because they need a value. */
  showRunButtons?: boolean;
  onPunch: (event: TrackableEvent, side: Side, value?: number) => void;
  disabled?: boolean;
};

const LABEL: Record<TrackableEvent, string> = {
  goal: 'Goal',
  run: 'Run',
  wicket: 'Wicket',
  boundary: '4',
  six: '6',
  wide: 'Wd',
  'no-ball': 'Nb',
  bye: 'Bye',
  yellow: 'Yellow',
  red: 'Red',
  foul: 'Foul',
  sub: 'Sub',
  let: 'Let',
  fault: 'Fault',
  'service-change': 'Service',
  move: 'Move',
  'draw-offer': 'Draw',
  resign: 'Resign',
  timeout: 'Timeout',
};

const ACCENT: Partial<Record<TrackableEvent, string>> = {
  goal: 'var(--accent)',
  six: 'var(--accent-2)',
  boundary: 'var(--accent-3)',
  wicket: 'var(--accent)',
  red: 'var(--accent)',
  yellow: 'var(--gold)',
};

export function PunchGrid({ teamA, teamB, trackable, showRunButtons, onPunch, disabled }: Props) {
  // Filter trackables that are score-relevant — others (sub, timeout) are
  // typed in a separate "Notes" row at the bottom.
  const score = trackable.filter((t) => !['sub', 'timeout', 'move'].includes(t));
  const notes = trackable.filter((t) => ['sub', 'timeout', 'move'].includes(t));

  return (
    <section className="mx-5 mb-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <SidePanel
          teamId={teamA}
          side="A"
          events={score}
          showRunButtons={showRunButtons}
          onPunch={onPunch}
          disabled={disabled}
        />
        <SidePanel
          teamId={teamB}
          side="B"
          events={score}
          showRunButtons={showRunButtons}
          onPunch={onPunch}
          disabled={disabled}
        />
      </div>

      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-line bg-bg-card/40 p-2">
          {notes.map((t) =>
            (['A', 'B'] as const).map((side) => (
              <button
                key={`${t}-${side}`}
                type="button"
                onClick={() => onPunch(t, side)}
                disabled={disabled}
                className="rounded-xl border border-line bg-bg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim active:scale-[0.96] disabled:opacity-50"
              >
                {LABEL[t]} · {teamLabelFor(side === 'A' ? teamA : teamB).slice(0, 3)}
              </button>
            )),
          )}
        </div>
      )}
    </section>
  );
}

function SidePanel({
  teamId,
  side,
  events,
  showRunButtons,
  onPunch,
  disabled,
}: {
  teamId: TeamId;
  side: Side;
  events: TrackableEvent[];
  showRunButtons?: boolean;
  onPunch: Props['onPunch'];
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-bg-card p-2">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: colorVarFor(teamId) }}
        />
        <span className="font-display text-[12px] uppercase tracking-[0.06em]">
          {teamLabelFor(teamId)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {showRunButtons &&
          [0, 1, 2, 4, 6].map((n) => (
            <button
              key={`run-${n}`}
              type="button"
              onClick={() => onPunch('run', side, n)}
              disabled={disabled}
              className={clsx(
                'rounded-lg border border-line bg-bg py-2 font-display text-base uppercase active:scale-[0.97] disabled:opacity-50',
                n === 4 && 'text-accent-3',
                n === 6 && 'text-accent-2',
              )}
            >
              {n}
            </button>
          ))}
        {events.map((t) => {
          const color = ACCENT[t] ?? 'var(--ink)';
          // Cricket: 4/6 already covered by run buttons; skip duplicates.
          if (showRunButtons && (t === 'boundary' || t === 'six')) return null;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPunch(t, side)}
              disabled={disabled}
              className="rounded-lg border border-line bg-bg py-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] active:scale-[0.97] disabled:opacity-50"
              style={{ color }}
            >
              {LABEL[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

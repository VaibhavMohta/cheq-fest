import { colorVarFor, type TeamId } from '@/types/team';

type Props = {
  teamA: TeamId;
  teamB: TeamId;
  /** Display name + stored color for each side. Caller resolves these from
   *  the team docs and threads them down; the component never invents a
   *  name from the raw id. */
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  scoreA: number;
  scoreB: number;
  /** Called with a side. The caller decides what "tap" means per sport. */
  onAdd: (side: 'A' | 'B') => void;
  /** Called to subtract. Used only when a numeric add was the most recent. */
  onSubtract: (side: 'A' | 'B') => void;
  disabled?: boolean;
};

export function Scoreboard({
  teamAName,
  teamBName,
  teamAColor,
  teamBColor,
  scoreA,
  scoreB,
  onAdd,
  onSubtract,
  disabled,
}: Props) {
  return (
    <section className="mx-5 mb-4 grid grid-cols-2 gap-2">
      <SideBlock
        name={teamAName}
        color={teamAColor}
        score={scoreA}
        onAdd={() => onAdd('A')}
        onSubtract={() => onSubtract('A')}
        disabled={disabled}
      />
      <SideBlock
        name={teamBName}
        color={teamBColor}
        score={scoreB}
        onAdd={() => onAdd('B')}
        onSubtract={() => onSubtract('B')}
        disabled={disabled}
      />
    </section>
  );
}

function SideBlock({
  name,
  color,
  score,
  onAdd,
  onSubtract,
  disabled,
}: {
  name: string;
  color: string;
  score: number;
  onAdd: () => void;
  onSubtract: () => void;
  disabled?: boolean;
}) {
  const colorVar = colorVarFor(color);
  return (
    <div
      className="rounded-3xl border border-line bg-bg-card p-3"
      style={{ borderColor: 'color-mix(in oklab, currentColor 30%, transparent)', color: colorVar }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: colorVar }} />
        <span className="font-display text-sm uppercase tracking-[0.06em] text-ink">{name}</span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="mt-2 grid w-full place-items-center rounded-2xl border border-line bg-bg p-3 transition active:scale-[0.98] disabled:opacity-50"
        aria-label={`Add point for ${name}`}
      >
        <span className="font-display text-[64px] leading-none tabular-nums text-ink">{score}</span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          Tap to +1
        </span>
      </button>
      <button
        type="button"
        onClick={onSubtract}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border border-line bg-bg-elev py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition active:scale-[0.98] disabled:opacity-50"
      >
        −1
      </button>
    </div>
  );
}

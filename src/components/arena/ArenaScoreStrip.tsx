import { Chip } from '@/components/shared/Chip';
import { colorVarFor, flagInitials, type TeamId } from '@/types/team';

type Props = {
  teamA: TeamId;
  teamB: TeamId;
  /** Display names + stored colors resolved by the parent. */
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
  scoreA: number;
  scoreB: number;
  /** Clock display, e.g. "12:34" or "Inn 2 · 14.3". */
  clock?: string;
  /** Match status chip. */
  status?: 'live' | 'upcoming' | 'done';
  /** Sport label (e.g. "Badminton — Men's Doubles") rendered above the
   *  status chip so viewers know what's being played. */
  sportName?: string;
  /** When provided, the corresponding team block becomes a button —
   *  used to open the squad sheet for that side. */
  onTeamAClick?: () => void;
  onTeamBClick?: () => void;
};

export function ArenaScoreStrip({
  teamAName,
  teamBName,
  teamAColor,
  teamBColor,
  scoreA,
  scoreB,
  clock,
  status = 'live',
  sportName,
  onTeamAClick,
  onTeamBClick,
}: Props) {
  return (
    <section className="mx-5 mb-3 flex items-stretch gap-2 rounded-2xl border border-line bg-bg-card p-3">
      <TeamBlock
        name={teamAName}
        color={teamAColor}
        score={scoreA}
        alignRight={false}
        onClick={onTeamAClick}
      />
      <div className="flex flex-col items-center justify-center gap-1">
        {sportName && (
          <span className="break-words text-center font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim leading-tight">
            {sportName}
          </span>
        )}
        <Chip variant={status}>
          {status === 'live' ? 'Live' : status === 'done' ? 'Ended' : 'Soon'}
        </Chip>
        {clock && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            {clock}
          </span>
        )}
      </div>
      <TeamBlock
        name={teamBName}
        color={teamBColor}
        score={scoreB}
        alignRight={true}
        onClick={onTeamBClick}
      />
    </section>
  );
}

function TeamBlock({
  name,
  color,
  score,
  alignRight,
  onClick,
}: {
  name: string;
  color: string;
  score: number;
  alignRight: boolean;
  onClick?: () => void;
}) {
  // Stack the team logo with the team name centered underneath. Score sits
  // to the score-strip side (right of logo for Team A, left of logo for
  // Team B) and is vertically centered so both scores align horizontally
  // regardless of how many lines the team name wraps to.
  const flagAndName = (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <Flag name={name} color={color} />
      <span className="text-center font-display text-[10px] uppercase leading-tight tracking-[0.06em] group-hover:underline underline-offset-2">
        {name}
      </span>
    </div>
  );
  const scoreEl = (
    <span className="font-display text-3xl leading-none tabular-nums">{score}</span>
  );

  const inner = alignRight ? (
    <>
      {scoreEl}
      {flagAndName}
    </>
  ) : (
    <>
      {flagAndName}
      {scoreEl}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Show ${name} squad`}
        className="group flex flex-1 cursor-pointer items-center gap-2 rounded-lg p-0.5 -mx-0.5 transition hover:bg-bg-elev active:scale-[0.99]"
        style={{ justifyContent: alignRight ? 'flex-end' : 'flex-start' }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      className="flex flex-1 items-center gap-2"
      style={{ justifyContent: alignRight ? 'flex-end' : 'flex-start' }}
    >
      {inner}
    </div>
  );
}

function Flag({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 place-items-center rounded-full font-display text-sm text-bg"
      style={{ background: colorVarFor(color) }}
    >
      {flagInitials(name)}
    </span>
  );
}

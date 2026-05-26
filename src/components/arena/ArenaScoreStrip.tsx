import { Chip } from '@/components/shared/Chip';
import { colorVarFor, teamLabelFor, type TeamId } from '@/types/team';

type Props = {
  teamA: TeamId;
  teamB: TeamId;
  scoreA: number;
  scoreB: number;
  /** Clock display, e.g. "12:34" or "Inn 2 · 14.3". */
  clock?: string;
  /** Match status chip. */
  status?: 'live' | 'upcoming' | 'done';
};

export function ArenaScoreStrip({ teamA, teamB, scoreA, scoreB, clock, status = 'live' }: Props) {
  return (
    <section className="mx-5 mb-3 flex items-stretch gap-2 rounded-2xl border border-line bg-bg-card p-3">
      <TeamBlock teamId={teamA} score={scoreA} alignRight={false} />
      <div className="flex flex-col items-center justify-center gap-1">
        <Chip variant={status}>{status === 'live' ? 'Live' : status === 'done' ? 'Final' : 'Soon'}</Chip>
        {clock && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            {clock}
          </span>
        )}
      </div>
      <TeamBlock teamId={teamB} score={scoreB} alignRight={true} />
    </section>
  );
}

function TeamBlock({
  teamId,
  score,
  alignRight,
}: {
  teamId: TeamId;
  score: number;
  alignRight: boolean;
}) {
  return (
    <div
      className="flex flex-1 items-center gap-2"
      style={{ justifyContent: alignRight ? 'flex-end' : 'flex-start' }}
    >
      {!alignRight && <Flag teamId={teamId} />}
      <div className="flex flex-col" style={{ alignItems: alignRight ? 'flex-end' : 'flex-start' }}>
        <span className="font-display text-xs uppercase tracking-[0.08em]">{teamLabelFor(teamId)}</span>
        <span className="font-display text-3xl leading-none tabular-nums">{score}</span>
      </div>
      {alignRight && <Flag teamId={teamId} />}
    </div>
  );
}

function Flag({ teamId }: { teamId: TeamId }) {
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 place-items-center rounded-full font-display text-sm text-bg"
      style={{ background: colorVarFor(teamId) }}
    >
      {teamLabelFor(teamId).slice(0, 2).toUpperCase()}
    </span>
  );
}

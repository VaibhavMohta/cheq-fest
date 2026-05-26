import clsx from 'clsx';
import { Link } from '@tanstack/react-router';
import { colorVarFor, teamLabelFor, type TeamId } from '@/types/team';

type Props = {
  rank: number;
  teamId: TeamId;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  /** Positive = up, negative = down, 0 = no change. */
  trend: number;
};

export function LeaderboardRow({ rank, teamId, wins, draws, losses, points, trend }: Props) {
  const goldOne = rank === 1;
  const flagInitials = teamLabelFor(teamId).slice(0, 2).toUpperCase();

  return (
    <Link
      to="/teams/$teamId"
      params={{ teamId }}
      className={clsx(
        'mx-5 mb-2 grid items-center gap-3 rounded-2xl border px-4 py-3 active:scale-[0.99]',
      )}
      style={{
        gridTemplateColumns: '32px 44px 1fr auto auto',
        background: goldOne
          ? 'linear-gradient(135deg, color-mix(in oklab, var(--gold) 15%, transparent), var(--bg-card))'
          : 'var(--bg-card)',
        borderColor: goldOne
          ? 'color-mix(in oklab, var(--gold) 40%, transparent)'
          : 'var(--line)',
      }}
    >
      <span
        className="font-display text-2xl leading-none text-ink"
        style={goldOne ? { color: 'var(--gold)' } : undefined}
      >
        {rank}
      </span>
      <span
        aria-hidden
        className="grid h-11 w-11 place-items-center rounded-full font-display text-base text-bg"
        style={{ background: colorVarFor(teamId) }}
      >
        {flagInitials}
      </span>
      <span>
        <span className="block font-display text-lg uppercase">{teamLabelFor(teamId)}</span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          {wins}W · {losses}L · {draws}D
        </span>
      </span>
      <Trend value={trend} />
      <span className="font-display text-2xl tabular-nums">{points}</span>
    </Link>
  );
}

function Trend({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="rounded-lg bg-ink-mute/10 px-2 py-0.5 font-mono text-[11px] text-ink-mute">
        —
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className="rounded-lg px-2 py-0.5 font-mono text-[11px]"
      style={{
        background: up
          ? 'color-mix(in oklab, var(--accent-2) 10%, transparent)'
          : 'color-mix(in oklab, var(--accent) 10%, transparent)',
        color: up ? 'var(--accent-2)' : 'var(--accent)',
      }}
    >
      {up ? '↑' : '↓'} {Math.abs(value)}
    </span>
  );
}

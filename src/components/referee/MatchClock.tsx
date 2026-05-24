import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Timestamp } from 'firebase/firestore';
import { formatClock, type MatchState } from '@/types/match';

type Props = {
  state: MatchState;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onNextPeriod: () => void;
  disabled?: boolean;
};

export function MatchClock({ state, onStart, onPause, onReset, onNextPeriod, disabled }: Props) {
  const [, force] = useState(0);

  // Tick the display every 250ms while running. Cheap (no Firestore writes).
  useEffect(() => {
    if (!state.isRunning) return;
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [state.isRunning]);

  const liveSeconds =
    state.clockSeconds +
    (state.isRunning && state.clockStartedAt instanceof Timestamp
      ? Math.max(0, Math.floor((Date.now() - state.clockStartedAt.toMillis()) / 1000))
      : 0);

  return (
    <section className="mx-5 mb-4 rounded-3xl border border-line bg-bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          Period {state.period}
        </span>
        <span
          className={clsx(
            'font-display text-[40px] leading-none tabular-nums',
            state.isRunning ? 'text-accent-2' : 'text-ink',
          )}
        >
          {formatClock(liveSeconds)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {state.isRunning ? (
          <ClockButton onClick={onPause} disabled={disabled}>
            Pause
          </ClockButton>
        ) : (
          <ClockButton onClick={onStart} disabled={disabled} variant="primary">
            Start
          </ClockButton>
        )}
        <ClockButton onClick={onReset} disabled={disabled}>
          Reset
        </ClockButton>
        <ClockButton onClick={onNextPeriod} disabled={disabled} className="col-span-2">
          Next period
        </ClockButton>
      </div>
    </section>
  );
}

function ClockButton({
  onClick,
  disabled,
  variant = 'ghost',
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded-xl px-2 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition active:scale-[0.97] disabled:opacity-50',
        variant === 'primary'
          ? 'bg-accent text-bg'
          : 'border border-line bg-bg text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

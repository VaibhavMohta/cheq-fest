import clsx from 'clsx';
import type { ReactNode } from 'react';

export type ChipVariant = 'live' | 'upcoming' | 'done' | 'neutral';

type Props = {
  variant?: ChipVariant;
  children: ReactNode;
  className?: string;
};

const VARIANTS: Record<ChipVariant, { wrap: string; dotClass?: string }> = {
  live: {
    wrap: 'bg-accent text-bg',
    dotClass: 'bg-bg animate-pulse',
  },
  upcoming: {
    wrap: 'text-accent-3',
    // Border + background applied inline to use color-mix on a CSS var.
  },
  done: {
    wrap: 'border border-line bg-ink-mute/10 text-ink-dim',
  },
  neutral: {
    wrap: 'border border-line bg-bg-card text-ink-dim',
  },
};

export function Chip({ variant = 'neutral', children, className }: Props) {
  const v = VARIANTS[variant];
  const inlineStyle: Record<string, string> | undefined =
    variant === 'upcoming'
      ? {
          background: 'color-mix(in oklab, var(--accent-3) 15%, transparent)',
          border: '1px solid color-mix(in oklab, var(--accent-3) 30%, transparent)',
        }
      : undefined;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase',
        'tracking-[0.06em]',
        v.wrap,
        className,
      )}
      style={inlineStyle}
    >
      {v.dotClass && <span className={clsx('h-1.5 w-1.5 rounded-full', v.dotClass)} />}
      {children}
    </span>
  );
}

import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export type TileAccent = 'primary' | 'cyan' | 'gold' | 'lime' | 'neutral';

type Props = {
  to: string;
  label: string;
  sub?: string;
  accent?: TileAccent;
  icon?: ReactNode;
  /** When true, render as a non-link with a "soon" badge. */
  disabled?: boolean;
};

const ACCENT_STYLES: Record<TileAccent, { bg: string; fg: string; border: string }> = {
  primary: { bg: 'var(--accent)', fg: '#000', border: 'var(--accent)' },
  cyan: { bg: 'color-mix(in oklab, var(--accent-3) 14%, transparent)', fg: 'var(--accent-3)', border: 'color-mix(in oklab, var(--accent-3) 40%, transparent)' },
  gold: { bg: 'color-mix(in oklab, var(--gold) 14%, transparent)', fg: 'var(--gold)', border: 'color-mix(in oklab, var(--gold) 40%, transparent)' },
  lime: { bg: 'color-mix(in oklab, var(--accent-2) 14%, transparent)', fg: 'var(--accent-2)', border: 'color-mix(in oklab, var(--accent-2) 40%, transparent)' },
  neutral: { bg: 'var(--bg-card)', fg: 'var(--ink)', border: 'var(--line)' },
};

export function QuickActionTile({ to, label, sub, accent = 'neutral', icon, disabled }: Props) {
  const s = ACCENT_STYLES[accent];
  const className = clsx(
    'relative flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition',
    disabled ? 'opacity-50' : 'active:scale-[0.99]',
  );
  const style = { background: s.bg, borderColor: s.border, color: s.fg };
  const inner = (
    <>
      {icon && (
        <span className="grid h-9 w-9 place-items-center" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm uppercase tracking-[0.08em]">{label}</span>
        {sub && (
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em] opacity-70">
            {sub}
          </span>
        )}
      </span>
      {disabled ? (
        <span
          className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] opacity-80"
          style={{ borderColor: 'currentColor' }}
        >
          Soon
        </span>
      ) : (
        <span aria-hidden className="font-display text-lg opacity-60">
          →
        </span>
      )}
    </>
  );
  if (disabled) {
    return (
      <div className={className} style={style} aria-disabled>
        {inner}
      </div>
    );
  }
  // The Profile uses string `to`; we keep it loose here. Concrete params
  // are enforced at the destination route.
  return (
    <Link to={to as never} className={className} style={style}>
      {inner}
    </Link>
  );
}

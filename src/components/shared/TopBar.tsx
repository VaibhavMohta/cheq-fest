import type { ReactNode } from 'react';
import { ModeDropdown } from './ModeDropdown';

type Props = {
  /** Title segments — the last word renders in accent orange when accentLast is true. */
  title: string;
  accentLast?: boolean;
  /** Page-specific actions, rendered LEFT of the global mode dropdown. */
  actions?: ReactNode;
  /** Hide the mode dropdown for this screen (rare — used only on login). */
  hideModeDropdown?: boolean;
};

export function TopBar({ title, accentLast = true, actions, hideModeDropdown }: Props) {
  let head = title;
  let tail = '';
  if (accentLast) {
    const idx = title.lastIndexOf(' ');
    if (idx !== -1) {
      head = title.slice(0, idx);
      tail = title.slice(idx);
    }
  }
  return (
    <header
      className="relative z-10 flex items-center justify-between gap-3 px-5 pt-12 pb-3.5"
      style={{
        background: 'linear-gradient(180deg, var(--bg) 70%, transparent)',
      }}
    >
      <h1
        className="min-w-0 truncate font-display text-[22px] uppercase"
        style={{ letterSpacing: '0.04em', lineHeight: 1 }}
      >
        {head}
        {tail && <span className="text-accent">{tail}</span>}
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {!hideModeDropdown && <ModeDropdown />}
      </div>
    </header>
  );
}

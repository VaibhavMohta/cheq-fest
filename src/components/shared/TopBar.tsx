import type { ReactNode } from 'react';

type Props = {
  /** Title segments — the last word renders in accent orange when accentLast is true. */
  title: string;
  accentLast?: boolean;
  actions?: ReactNode;
};

export function TopBar({ title, accentLast = true, actions }: Props) {
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
      className="relative z-10 flex items-center justify-between px-5 pt-12 pb-3.5"
      style={{
        background: 'linear-gradient(180deg, var(--bg) 70%, transparent)',
      }}
    >
      <h1
        className="font-display text-[22px] uppercase"
        style={{ letterSpacing: '0.04em', lineHeight: 1 }}
      >
        {head}
        {tail && <span className="text-accent">{tail}</span>}
      </h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

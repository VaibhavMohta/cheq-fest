import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional right-side link, e.g. "FULL BOARD →". */
  trailing?: ReactNode;
};

export function SectionTitle({ children, trailing }: Props) {
  return (
    <div
      className="mt-6 mb-3 flex items-center gap-2.5 px-5 font-display text-[13px] uppercase text-ink-dim"
      style={{ letterSpacing: '0.18em' }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full bg-accent"
      />
      <span className="flex-1">{children}</span>
      {trailing && (
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-dim">
          {trailing}
        </span>
      )}
    </div>
  );
}

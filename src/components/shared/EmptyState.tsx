import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  icon?: ReactNode;
};

export function EmptyState({ title, hint, icon }: Props) {
  return (
    <div className="mx-5 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-bg-card/40 px-5 py-8 text-center">
      {icon && <div className="text-ink-mute">{icon}</div>}
      <p className="font-display text-base uppercase tracking-[0.12em] text-ink-dim">{title}</p>
      {hint && (
        <p className="max-w-[260px] font-mono text-[10px] tracking-[0.06em] text-ink-mute uppercase">
          {hint}
        </p>
      )}
    </div>
  );
}

import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { BUCKET_ACCENT, BUCKET_LABEL, type BucketId } from '@/lib/lineup';

type Props = {
  bucket: BucketId;
  count: number;
  /** When set, "n / cap" is displayed and a dashed placeholder fills empty slots. */
  cap?: number;
  children: ReactNode;
};

export function BucketSection({ bucket, count, cap, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: bucket });
  const accent = BUCKET_ACCENT[bucket];

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        'mx-5 mb-4 rounded-2xl border transition-colors',
        isOver ? 'border-ink/40 bg-bg-card' : 'border-line bg-bg-card/70',
      )}
      style={isOver ? { boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: accent }}
        />
        <h3 className="flex-1 font-display text-sm uppercase tracking-[0.12em]">
          {BUCKET_LABEL[bucket]}
        </h3>
        <span
          className="font-mono text-[11px] tabular-nums tracking-[0.06em]"
          style={{ color: cap !== undefined && count >= cap ? accent : 'var(--ink-dim)' }}
        >
          {cap !== undefined ? `${count} / ${cap}` : count}
        </span>
      </header>
      <div className="grid grid-cols-4 gap-2 px-3 pb-3">
        {children}
        {cap !== undefined &&
          count < cap &&
          Array.from({ length: cap - count }).map((_, i) => (
            <div
              key={`empty-${bucket}-${i}`}
              aria-hidden
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 opacity-50"
            >
              <span
                className="h-14 w-14 rounded-full border-2 border-dashed"
                style={{ borderColor: 'var(--ink-mute)' }}
              />
              <span className="h-[11px]" />
              <span className="h-[12px]" />
            </div>
          ))}
      </div>
    </section>
  );
}

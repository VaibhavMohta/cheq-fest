import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

export function IconButton({ active, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'grid h-9 w-9 place-items-center rounded-xl border transition active:scale-[0.92]',
        active
          ? 'border-accent bg-accent text-bg'
          : 'border-line bg-bg-card text-ink hover:border-ink-mute',
        className,
      )}
    >
      {children}
    </button>
  );
}

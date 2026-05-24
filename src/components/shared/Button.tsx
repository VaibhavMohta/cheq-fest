import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent text-bg font-bold uppercase tracking-[0.08em] text-sm py-4 rounded-2xl active:scale-[0.98] disabled:opacity-50',
  ghost:
    'bg-transparent text-ink border border-line font-semibold uppercase tracking-[0.06em] text-[13px] py-3.5 rounded-2xl active:scale-[0.98] disabled:opacity-50',
};

export function Button({ variant = 'primary', className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx('w-full transition', VARIANT_CLASSES[variant], className)}
    >
      {children}
    </button>
  );
}

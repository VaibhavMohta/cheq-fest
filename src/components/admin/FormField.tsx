import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type LabelProps = {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
};

export function FormField({ label, hint, children }: LabelProps) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint && (
        <span className="mt-1 block font-mono text-[10px] tracking-[0.06em] text-ink-mute">
          {hint}
        </span>
      )}
    </label>
  );
}

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(INPUT_CLASS, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(INPUT_CLASS, 'resize-y min-h-[120px]', props.className)} />;
}

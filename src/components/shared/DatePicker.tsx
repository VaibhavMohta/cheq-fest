import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import clsx from 'clsx';

type Props = {
  /** Selected date, or null. */
  value: Date | null;
  onChange: (next: Date | null) => void;
  placeholder?: string;
  /** Earliest year selectable. Defaults to current year - 2. */
  fromYear?: number;
  /** Latest year selectable. Defaults to current year + 5. */
  toYear?: number;
  /** Disable the input. */
  disabled?: boolean;
};

/**
 * Pop-over date picker. Click the input → calendar opens below with
 * year + month dropdowns (DayPicker `captionLayout="dropdown"`). Closes on
 * outside-click. Output is a JS Date snapped to local midnight; convert to
 * Firestore Timestamp at the call site.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  fromYear,
  toYear,
  disabled,
}: Props) {
  const now = new Date();
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={clsx(
          'flex w-full items-center justify-between rounded-xl border border-line bg-bg px-3 py-2.5 text-left text-sm transition',
          'focus:border-accent focus:outline-none disabled:opacity-50',
          value ? 'text-ink' : 'text-ink-mute',
        )}
      >
        <span>{value ? formatHuman(value) : placeholder}</span>
        <span aria-hidden className="text-ink-dim">📅</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 rounded-2xl border border-line bg-bg-card p-2 shadow-xl"
          style={{ minWidth: 280 }}
        >
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => {
              onChange(d ?? null);
              setOpen(false);
            }}
            captionLayout="dropdown"
            startMonth={new Date(fromYear ?? now.getFullYear() - 2, 0)}
            endMonth={new Date(toYear ?? now.getFullYear() + 5, 11)}
            classNames={DAY_PICKER_CLASSES}
            today={now}
          />
        </div>
      )}
    </div>
  );
}

function formatHuman(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Theme overrides — react-day-picker ships default styles via the import
// above; we override the parts that need to feel CHEQ-y. Keep these minimal
// — most things inherit from the base stylesheet.
const DAY_PICKER_CLASSES = {
  root: 'cheq-day-picker text-ink',
  caption_label: 'font-display uppercase tracking-[0.06em] text-sm',
  nav: 'flex gap-1',
  button_previous:
    'rounded-md border border-line bg-bg text-ink hover:text-accent p-1',
  button_next:
    'rounded-md border border-line bg-bg text-ink hover:text-accent p-1',
  dropdown:
    'rounded-md border border-line bg-bg px-1.5 py-1 text-sm uppercase text-ink',
  dropdowns: 'flex gap-1.5',
  weekday: 'font-mono text-[10px] uppercase text-ink-dim',
  day: 'p-1',
  day_button:
    'aspect-square w-9 rounded-md text-sm hover:bg-bg-elev focus:bg-bg-elev focus:outline-none',
  today: 'font-bold text-accent-2',
  selected:
    '!bg-accent !text-bg [&_button]:!bg-accent [&_button]:!text-bg [&_button]:!font-bold',
  outside: 'text-ink-mute',
  disabled: 'opacity-30',
};

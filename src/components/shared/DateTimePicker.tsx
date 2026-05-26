import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import clsx from 'clsx';

type Props = {
  /** Selected datetime, or null. */
  value: Date | null;
  onChange: (next: Date | null) => void;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
  /** Minute step on the wheel (e.g. 5 → 0,5,10,...). Defaults to 5. */
  minuteStep?: number;
  disabled?: boolean;
};

/**
 * Combined calendar + 12-hour time picker. Opens on click, closes on outside
 * click or explicit "Done". Time entered as HH (1–12) + MM (00–59, stepped)
 * with an AM/PM toggle, so the visible interaction matches what users
 * expect on mobile.
 *
 * The returned `Date` is in the browser's local timezone — convert to a
 * Firestore Timestamp at the call site (`Timestamp.fromDate(date)`).
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick a date & time',
  fromYear,
  toYear,
  minuteStep = 5,
  disabled,
}: Props) {
  const now = new Date();
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  // Draft state — we don't commit until the user changes a field or presses
  // Done, so opening the picker doesn't auto-fill an empty input.
  const [draftDate, setDraftDate] = useState<Date | null>(value);
  useEffect(() => {
    setDraftDate(value);
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Derive the displayed clock components from the draft (or default to
  // a sane "now-ish" time on first open if no value is set yet).
  const seed = draftDate ?? defaultSeed(now);
  const hours24 = seed.getHours();
  const ampm: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hours24 + 11) % 12) + 1; // 1..12
  const minute = seed.getMinutes();

  function commit(next: Date) {
    setDraftDate(next);
    onChange(next);
  }

  function updateDate(d: Date | undefined) {
    if (!d) return;
    const base = draftDate ?? defaultSeed(now);
    const merged = new Date(d);
    merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
    commit(merged);
  }

  function updateHour(h12: number) {
    const base = draftDate ?? defaultSeed(now);
    const h24 = to24(h12, ampm);
    const merged = new Date(base);
    merged.setHours(h24, minute, 0, 0);
    commit(merged);
  }

  function updateMinute(m: number) {
    const base = draftDate ?? defaultSeed(now);
    const merged = new Date(base);
    merged.setHours(base.getHours(), m, 0, 0);
    commit(merged);
  }

  function updateAmPm(next: 'AM' | 'PM') {
    if (next === ampm) return;
    const base = draftDate ?? defaultSeed(now);
    const merged = new Date(base);
    merged.setHours(to24(hour12, next), minute, 0, 0);
    commit(merged);
  }

  function clear() {
    setDraftDate(null);
    onChange(null);
    setOpen(false);
  }

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
          className="absolute left-0 top-full z-50 mt-1.5 flex flex-col gap-2 rounded-2xl border border-line bg-bg-card p-2 shadow-xl"
          style={{ minWidth: 280 }}
        >
          <DayPicker
            mode="single"
            selected={draftDate ?? undefined}
            onSelect={updateDate}
            captionLayout="dropdown"
            startMonth={new Date(fromYear ?? now.getFullYear() - 2, 0)}
            endMonth={new Date(toYear ?? now.getFullYear() + 5, 11)}
            classNames={DAY_PICKER_CLASSES}
            today={now}
          />

          {/* Time row — 12-hour HH : MM with AM/PM toggle. */}
          <div className="flex items-center justify-between gap-2 border-t border-line px-1 pt-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
              Time
            </span>
            <div className="flex items-center gap-1">
              <select
                aria-label="Hour"
                value={hour12}
                onChange={(e) => updateHour(Number(e.target.value))}
                className="rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm tabular-nums text-ink focus:border-accent focus:outline-none"
              >
                {HOURS_12.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="font-mono text-ink-dim">:</span>
              <select
                aria-label="Minute"
                value={minute - (minute % minuteStep)}
                onChange={(e) => updateMinute(Number(e.target.value))}
                className="rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm tabular-nums text-ink focus:border-accent focus:outline-none"
              >
                {buildMinutes(minuteStep).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <div className="ml-1 flex overflow-hidden rounded-md border border-line">
                {(['AM', 'PM'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateAmPm(p)}
                    className={clsx(
                      'px-2 py-1 font-mono text-[11px] uppercase transition',
                      ampm === p ? 'bg-accent text-bg' : 'bg-bg text-ink-dim hover:text-ink',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-1 pt-2">
            <button
              type="button"
              onClick={clear}
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim hover:text-accent"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-accent bg-accent px-3 py-1 font-display text-[11px] uppercase tracking-[0.06em] text-bg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function buildMinutes(step: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < 60; m += step) out.push(m);
  return out;
}

function to24(h12: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function defaultSeed(now: Date): Date {
  // Snap to today at the next quarter-hour so the seed feels intentional
  // rather than "23 minutes past".
  const d = new Date(now);
  const m = d.getMinutes();
  const next = Math.ceil(m / 15) * 15;
  if (next === 60) d.setHours(d.getHours() + 1, 0, 0, 0);
  else d.setMinutes(next, 0, 0);
  return d;
}

function formatHuman(d: Date): string {
  const date = d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} · ${time}`;
}

// Mirror DatePicker's theme.
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

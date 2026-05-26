import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useRole, ROLE_LABEL, type Role } from '@/lib/roles';

/**
 * "View as" mode switcher rendered in the TopBar's right slot on every
 * screen. Lets a user (typically Super Admin) preview the UI as if they
 * were a different role.
 *
 *  - Modes available = roles the user actually holds + guest.
 *  - Selecting a mode persists it in localStorage and navigates to Home so
 *    the user lands somewhere sensible regardless of which screen they were
 *    on (the previous screen may not be reachable in the new mode).
 *  - Hidden when there's only one possible mode (nothing to switch to).
 *
 * NB: this is a UI affordance only. Server-side Firestore rules still
 * enforce the user's *actual* claims — switching to "Admin" mode doesn't
 * grant admin powers if you don't already have them.
 */
export function ModeDropdown() {
  const role = useRole();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Nothing to switch to → don't crowd the header.
  if (role.availableModes.length <= 1) return null;

  function pick(next: Role) {
    role.setActiveMode(next);
    setOpen(false);
    // Land on Home — the previous screen may be gated out of the new mode
    // (e.g. switching from Admin → Player while on /admin would deny).
    void navigate({ to: '/' });
  }

  const colorByMode: Record<Role, string> = {
    'super-admin': 'var(--gold)',
    admin: 'var(--accent)',
    'group-cap': 'var(--gold)',
    'sport-cap': 'var(--accent-3)',
    referee: 'var(--accent-2)',
    player: 'var(--ink)',
    guest: 'var(--ink-dim)',
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Current mode: ${ROLE_LABEL[role.activeMode]}. Tap to switch.`}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-bg-card px-2 py-1.5 transition active:scale-[0.97]"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: colorByMode[role.activeMode] }}
        />
        <span
          className="font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
          style={{ color: colorByMode[role.activeMode] }}
        >
          {ROLE_LABEL[role.activeMode]}
        </span>
        <span aria-hidden className="font-display text-xs text-ink-dim">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[170px] rounded-2xl border border-line bg-bg-card p-1.5 shadow-xl"
        >
          <p className="px-2 pb-1 pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            View as
          </p>
          {role.availableModes.map((m) => {
            const active = m === role.activeMode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pick(m)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.06em] transition',
                  active ? 'bg-bg-elev' : 'hover:bg-bg-elev',
                )}
                style={active ? { color: colorByMode[m] } : { color: 'var(--ink)' }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: colorByMode[m] }}
                />
                <span className="flex-1">{ROLE_LABEL[m]}</span>
                {active && (
                  <span aria-hidden className="text-[10px]" style={{ color: colorByMode[m] }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

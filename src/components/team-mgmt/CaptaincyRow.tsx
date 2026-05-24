import { useState } from 'react';
import clsx from 'clsx';
import { Avatar } from '@/components/shared/Avatar';
import type { TeamId } from '@/types/team';

export type CaptaincyCandidate = {
  uid: string;
  name: string;
  teamId: TeamId;
  googlePhotoUrl?: string | null;
  adminPhotoUrl?: string | null;
};

type Props = {
  label: string;
  /** e.g. "Vice" / "★" — appears as a tiny prefix on the assignee. */
  badgeText?: string;
  /** Color of the row accent (border, badge). */
  accentColor?: string;
  candidates: readonly CaptaincyCandidate[];
  /** uid of the current assignee, or null. */
  assigneeUid: string | null;
  onAssign: (uid: string | null) => void;
};

export function CaptaincyRow({
  label,
  badgeText,
  accentColor = 'var(--gold)',
  candidates,
  assigneeUid,
  onAssign,
}: Props) {
  const [open, setOpen] = useState(false);
  const assignee = candidates.find((c) => c.uid === assigneeUid) ?? null;

  return (
    <section
      className="mx-5 mb-2 overflow-hidden rounded-2xl border border-line bg-bg-card"
      style={open ? { borderColor: accentColor } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex flex-1 items-center gap-3">
          {assignee ? (
            <>
              <Avatar
                name={assignee.name}
                teamId={assignee.teamId}
                googlePhotoUrl={assignee.googlePhotoUrl}
                adminPhotoUrl={assignee.adminPhotoUrl}
                size={44}
                surfaceColor="var(--bg-card)"
              />
              <span className="min-w-0">
                <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                  {label}
                </span>
                <span className="block truncate font-display text-base uppercase">
                  {assignee.name}
                </span>
              </span>
            </>
          ) : (
            <>
              <span
                aria-hidden
                className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-ink-mute font-display text-xs uppercase text-ink-mute"
              >
                ?
              </span>
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                  {label}
                </span>
                <span className="block font-display text-base uppercase text-ink-mute">
                  Unassigned
                </span>
              </span>
            </>
          )}
        </span>
        {badgeText && (
          <span
            className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
            style={{ color: accentColor, borderColor: 'color-mix(in oklab, currentColor 40%, transparent)' }}
          >
            {badgeText}
          </span>
        )}
        <span
          aria-hidden
          className={clsx(
            'font-display text-base text-ink-dim transition-transform',
            open && 'rotate-90',
          )}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="border-t border-line bg-bg/40 px-2 py-3">
          <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            Tap a player to assign{assigneeUid ? ' (or tap again to clear)' : ''}
          </p>
          <div className="flex gap-2 overflow-x-auto px-2 pb-1">
            {candidates.map((c) => {
              const active = c.uid === assigneeUid;
              return (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => onAssign(active ? null : c.uid)}
                  className={clsx(
                    'flex shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 transition active:scale-[0.96]',
                    active ? 'bg-bg-elev' : 'bg-transparent',
                  )}
                  style={active ? { boxShadow: `inset 0 0 0 1px ${accentColor}` } : undefined}
                >
                  <Avatar
                    name={c.name}
                    teamId={c.teamId}
                    googlePhotoUrl={c.googlePhotoUrl}
                    adminPhotoUrl={c.adminPhotoUrl}
                    size={44}
                    surfaceColor={active ? 'var(--bg-elev)' : 'var(--bg)'}
                  />
                  <span
                    className="font-display text-[11px] uppercase leading-none tracking-[0.06em]"
                    style={active ? { color: accentColor } : undefined}
                  >
                    {c.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

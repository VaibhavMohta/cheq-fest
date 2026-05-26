import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { useRole } from '@/lib/roles';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
import { teamRef } from '@/lib/db';
import { colorVarFor, flagInitials } from '@/types/team';
import type { TeamDoc } from '@/types/player';

/**
 * Group Captain team management. Driven entirely by the live `useRole`
 * data: if the user holds the `group-cap` role in the active event, their
 * team(s) load from Firestore and the roster renders. Otherwise we show
 * a clear empty state — but only after role + auth have actually
 * resolved, so we don't flash "Not a GC" at someone who actually is one.
 */
export default function TeamMgmtScreen() {
  const role = useRole();
  const { activeEventId } = useActiveEvent();

  if (role.loading) {
    return (
      <>
        <TopBar title="Manage Team" />
        <main className="mx-auto max-w-[420px] pb-28">
          <p className="px-5 text-ink-dim">Checking your captaincy…</p>
        </main>
      </>
    );
  }

  const teamIds = role.groupCaptainOf;
  if (teamIds.length === 0) {
    return (
      <>
        <TopBar title="Manage Team" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="Not a Group Captain yet"
            hint="Once an admin assigns you as Group Captain for a team in the active event, your roster will appear here."
          />
        </main>
      </>
    );
  }

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Manage Team" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see your team."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Manage Team" />
      <main className="mx-auto flex max-w-[420px] flex-col gap-5 pb-28">
        {teamIds.map((teamId) => (
          <TeamBlock key={teamId} eventId={activeEventId} teamId={teamId} />
        ))}
      </main>
    </>
  );
}

function TeamBlock({ eventId, teamId }: { eventId: string; teamId: string }) {
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { people } = useAllEventPlayers();

  useEffect(() => {
    return onSnapshot(teamRef(eventId, teamId), (snap) => {
      setTeam(snap.exists() ? snap.data() : null);
      setLoaded(true);
    });
  }, [eventId, teamId]);

  if (!loaded) {
    return <p className="px-5 text-ink-dim">Loading {teamId}…</p>;
  }
  if (!team) {
    return (
      <EmptyState
        title="Team not found"
        hint={`Your captaincy points at "${teamId}" but the team isn't in this event. An admin may have deleted it.`}
      />
    );
  }

  const color = colorVarFor(team.color);
  const memberEmails = new Set(team.members.map((m) => m.toLowerCase()));
  const roster = people.filter((p) => memberEmails.has(p.email.toLowerCase()));

  return (
    <section className="flex flex-col gap-3">
      {/* Hero */}
      <div
        className="mx-5 rounded-3xl p-5 text-bg"
        style={{ background: `linear-gradient(135deg, ${color}, #0f0e0c)` }}
      >
        <div className="flex items-center gap-3">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              className="h-14 w-14 rounded-full border-2 border-bg/30 object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 place-items-center rounded-full border-2 border-bg/30 font-display text-lg"
            >
              {flagInitials(team.name)}
            </span>
          )}
          <div>
            <p className="font-display text-3xl leading-none uppercase">{team.name}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] opacity-70">
              You're the Group Captain · {team.members.length} player
              {team.members.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="mx-5 flex flex-col gap-1.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Roster ({roster.length})
        </h3>
        {roster.length === 0 ? (
          <EmptyState
            title="No players on this team yet"
            hint="Admin assigns players from the Teams tab; they'll appear here automatically."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {roster.map((p) => (
              <li
                key={p.key}
                className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2"
              >
                <Avatar name={p.name} teamId={team.color} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {p.email}
                  </p>
                </div>
                {!p.isClaimed && (
                  <span className="rounded-md border border-line bg-bg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
                    Staged
                  </span>
                )}
                {team.viceCaptainEmail?.toLowerCase() === p.email.toLowerCase() && (
                  <span
                    className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{
                      color: 'var(--accent-3)',
                      borderColor: 'color-mix(in oklab, var(--accent-3) 40%, transparent)',
                    }}
                  >
                    Vice
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Captains summary */}
      <div className="mx-5 flex flex-col gap-1.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Captains
        </h3>
        <p className="rounded-xl border border-line bg-bg-card px-3 py-2.5 font-mono text-[11px] tracking-[0.06em] text-ink">
          Group · <span className="text-ink-dim">{team.groupCaptainEmail ?? '—'}</span>
        </p>
        <p className="rounded-xl border border-line bg-bg-card px-3 py-2.5 font-mono text-[11px] tracking-[0.06em] text-ink">
          Vice · <span className="text-ink-dim">{team.viceCaptainEmail ?? 'Not assigned'}</span>
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
          Vice-captain + Sport-captain pickers land next.
        </p>
      </div>
    </section>
  );
}

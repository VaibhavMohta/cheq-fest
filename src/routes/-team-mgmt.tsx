import { useEffect, useMemo, useState } from 'react';
import { getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Avatar } from '@/components/shared/Avatar';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import { useRole } from '@/lib/roles';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import {
  rosterRef,
  rostersCol,
  sportsCol,
  teamRef,
  type RosterDoc,
} from '@/lib/db';
import { colorVarFor, flagInitials } from '@/types/team';
import type { TeamDoc } from '@/types/player';
import type { SportDoc } from '@/types/sport';

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
        <ViceCaptainPicker
          eventId={eventId}
          teamId={teamId}
          roster={roster}
          currentEmail={team.viceCaptainEmail}
          groupCaptainEmail={team.groupCaptainEmail}
        />
      </div>

      {/* Sport Captains */}
      <SportCaptainsSection eventId={eventId} teamId={teamId} roster={roster} />
    </section>
  );
}

function ViceCaptainPicker({
  eventId,
  teamId,
  roster,
  currentEmail,
  groupCaptainEmail,
}: {
  eventId: string;
  teamId: string;
  roster: PersonRow[];
  currentEmail: string | null;
  groupCaptainEmail: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Don't let the GC pick themselves as Vice — those are distinct roles.
  const gcLower = groupCaptainEmail?.toLowerCase() ?? null;
  const candidates = useMemo(
    () => roster.filter((p) => p.email.toLowerCase() !== gcLower),
    [roster, gcLower],
  );

  const selected = useMemo<PersonRow[]>(() => {
    if (!currentEmail) return [];
    const lower = currentEmail.toLowerCase();
    const match = candidates.find((p) => p.email.toLowerCase() === lower);
    return match ? [match] : [];
  }, [currentEmail, candidates]);

  const save = useMutation({
    mutationFn: async (email: string | null) => {
      await setDoc(
        teamRef(eventId, teamId),
        { viceCaptainEmail: email?.toLowerCase() ?? null },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'team', eventId, teamId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'teams', eventId] });
    },
  });

  return (
    <div className="rounded-xl border border-line bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-mono text-[11px] tracking-[0.06em] text-ink"
      >
        <span>
          Vice · <span className="text-ink-dim">{currentEmail ?? 'Not assigned'}</span>
        </span>
        <span
          className={
            currentEmail
              ? 'rounded-md border border-accent-2/40 bg-accent-2/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-accent-2'
              : 'rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-accent'
          }
        >
          {save.isPending ? 'Saving…' : currentEmail ? 'Change' : 'Assign'}
        </span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          {candidates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
              No eligible teammates yet — add players first.
            </p>
          ) : (
            <PlayerPicker
              mode="single"
              available={candidates}
              selected={selected}
              onChange={(next) => {
                save.mutate(next[0]?.email.toLowerCase() ?? null);
                setOpen(false);
              }}
              searchPlaceholder="Search vice captain…"
              emptySelectedLabel="No Vice Captain picked"
            />
          )}
        </div>
      )}
    </div>
  );
}

function SportCaptainsSection({
  eventId,
  teamId,
  roster,
}: {
  eventId: string;
  teamId: string;
  roster: PersonRow[];
}) {
  const qc = useQueryClient();

  const sports = useQuery({
    queryKey: ['sports', eventId],
    queryFn: async (): Promise<(SportDoc & { id: string })[]> => {
      const snap = await getDocs(sportsCol(eventId));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const rosters = useQuery({
    queryKey: ['rosters', eventId, teamId],
    queryFn: async (): Promise<Map<string, RosterDoc>> => {
      const snap = await getDocs(rostersCol(eventId, teamId));
      const m = new Map<string, RosterDoc>();
      for (const d of snap.docs) m.set(d.id, d.data());
      return m;
    },
  });

  const setSportCaptain = useMutation({
    mutationFn: async (args: { sportId: string; email: string | null }) => {
      const existing = rosters.data?.get(args.sportId);
      // First-time write needs the full shape (security rule does a get()
      // on the existing doc, so subsequent writes are merges). Always use
      // merge so we don't clobber whatever the Sport Captain has already
      // dropped into the buckets.
      const patch: Partial<RosterDoc> = {
        sportCaptainEmail: args.email?.toLowerCase() ?? null,
      };
      if (!existing) {
        patch.pitch = [];
        patch.tentative = [];
        patch.substitutes = [];
        patch.notPlaying = [];
      }
      await setDoc(rosterRef(eventId, teamId, args.sportId), patch, { merge: true });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rosters', eventId, teamId] });
    },
  });

  if (sports.isLoading || rosters.isLoading) {
    return (
      <div className="mx-5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Sport Captains
        </h3>
        <p className="mt-2 font-mono text-[10px] text-ink-dim">Loading sports…</p>
      </div>
    );
  }

  const allSports = sports.data ?? [];
  if (allSports.length === 0) {
    return (
      <div className="mx-5 flex flex-col gap-1.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Sport Captains
        </h3>
        <EmptyState
          title="No sports yet"
          hint="Admin needs to import or add sports for this event before you can assign captains."
        />
      </div>
    );
  }

  return (
    <div className="mx-5 flex flex-col gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Sport Captains
      </h3>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
        Pick one captain per sport. They'll then assign players to the four
        pitch / tentative / substitute / not-playing buckets in the Lineup
        screen.
      </p>
      <div className="flex flex-col gap-1.5">
        {allSports.map((sport) => (
          <SportCaptainRow
            key={sport.id}
            sport={sport}
            roster={roster}
            currentEmail={rosters.data?.get(sport.id)?.sportCaptainEmail ?? null}
            saving={
              setSportCaptain.isPending &&
              setSportCaptain.variables?.sportId === sport.id
            }
            onAssign={(email) => setSportCaptain.mutate({ sportId: sport.id, email })}
          />
        ))}
      </div>
    </div>
  );
}

function SportCaptainRow({
  sport,
  roster,
  currentEmail,
  saving,
  onAssign,
}: {
  sport: SportDoc & { id: string };
  roster: PersonRow[];
  currentEmail: string | null;
  saving: boolean;
  onAssign: (email: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const current = useMemo<PersonRow[]>(() => {
    if (!currentEmail) return [];
    const lower = currentEmail.toLowerCase();
    const match = roster.find((p) => p.email.toLowerCase() === lower);
    return match ? [match] : [];
  }, [currentEmail, roster]);

  return (
    <div className="rounded-2xl border border-line bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm uppercase tracking-[0.04em]">
            {sport.name}
          </p>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-dim">
            {currentEmail
              ? `Captain · ${currentEmail}`
              : 'No Sport Captain assigned'}
          </p>
        </div>
        <span
          className={
            currentEmail
              ? 'rounded-md border border-accent-2/40 bg-accent-2/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent-2'
              : 'rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent'
          }
        >
          {saving ? 'Saving…' : currentEmail ? 'Change' : 'Assign'}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-3">
          {roster.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
              No players on this team yet — assign players first in the
              admin Teams tab.
            </p>
          ) : (
            <PlayerPicker
              mode="single"
              available={roster}
              selected={current}
              onChange={(next) => {
                onAssign(next[0]?.email.toLowerCase() ?? null);
                setOpen(false);
              }}
              searchPlaceholder={`Search ${sport.name} captain…`}
              emptySelectedLabel="No Sport Captain picked"
            />
          )}
        </div>
      )}
    </div>
  );
}

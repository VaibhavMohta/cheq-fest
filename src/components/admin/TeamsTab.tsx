import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDocs, setDoc } from 'firebase/firestore';
import { Avatar } from '@/components/shared/Avatar';
import {
  stagedPlayersCol,
  teamRef,
  teamsCol,
  usersCol,
} from '@/lib/db';
import { TEAM_COLOR_VAR, TEAM_IDS, TEAM_LABEL, type TeamId } from '@/types/team';
import type { TeamDoc } from '@/types/player';

const TEAMS_QK = ['admin', 'teams'] as const;
const STAGED_QK = ['admin', 'stagedPlayers'] as const;
const CLAIMED_QK = ['admin', 'claimedPlayers'] as const;

export function TeamsTab() {
  const qc = useQueryClient();

  const teams = useQuery({
    queryKey: TEAMS_QK,
    queryFn: async () => {
      const snap = await getDocs(teamsCol);
      const map = new Map<TeamId, TeamDoc & { id: TeamId }>();
      for (const d of snap.docs) {
        const id = d.id as TeamId;
        if (TEAM_IDS.includes(id)) map.set(id, { id, ...d.data() });
      }
      return map;
    },
  });

  const staged = useQuery({
    queryKey: STAGED_QK,
    queryFn: async () => {
      const snap = await getDocs(stagedPlayersCol);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const claimed = useQuery({
    queryKey: CLAIMED_QK,
    queryFn: async () => {
      const snap = await getDocs(usersCol);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
  });

  const createTeam = useMutation({
    mutationFn: async (teamId: TeamId) => {
      await setDoc(
        teamRef(teamId),
        {
          name: TEAM_LABEL[teamId],
          color: teamId,
          logoUrl: null,
          members: [],
          groupCaptainUid: null,
          viceCaptainUid: null,
          totalPoints: 0,
        },
        { merge: true },
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEAMS_QK }),
  });

  const setGroupCaptain = useMutation({
    mutationFn: async (args: { teamId: TeamId; uid: string | null }) => {
      await setDoc(teamRef(args.teamId), { groupCaptainUid: args.uid }, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TEAMS_QK }),
  });

  const assignStagedToTeam = useMutation({
    mutationFn: async (args: { stagedId: string; teamId: TeamId | null }) => {
      await setDoc(
        doc(stagedPlayersCol, args.stagedId),
        { teamId: args.teamId },
        { merge: true },
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: STAGED_QK }),
  });

  const assignClaimedToTeam = useMutation({
    mutationFn: async (args: { uid: string; teamId: TeamId | null }) => {
      await setDoc(doc(usersCol, args.uid), { teamId: args.teamId }, { merge: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAIMED_QK }),
  });

  // All players (staged + claimed), grouped by current teamId.
  type RosterEntry =
    | { kind: 'staged'; id: string; email: string; name: string; teamId: TeamId | null }
    | { kind: 'claimed'; uid: string; email: string; name: string; teamId: TeamId | null };

  const allPlayers = useMemo<RosterEntry[]>(() => {
    const claimedRows: RosterEntry[] = (claimed.data ?? []).map((u) => ({
      kind: 'claimed',
      uid: u.uid,
      email: u.email,
      name: u.displayName ?? u.email.split('@')[0]!,
      teamId: u.teamId ?? null,
    }));
    const stagedRows: RosterEntry[] = (staged.data ?? []).map((s) => ({
      kind: 'staged',
      id: s.id,
      email: s.email,
      name: s.displayName,
      teamId: s.teamId ?? null,
    }));
    return [...claimedRows, ...stagedRows];
  }, [claimed.data, staged.data]);

  if (teams.isLoading || staged.isLoading || claimed.isLoading) {
    return <p className="px-5 text-ink-dim">Loading teams…</p>;
  }

  const teamCount = teams.data?.size ?? 0;

  return (
    <div className="mx-5 flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Teams ({teamCount} / 4)
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {TEAM_IDS.map((teamId) => {
            const team = teams.data?.get(teamId);
            return (
              <TeamCard
                key={teamId}
                teamId={teamId}
                team={team ?? null}
                onCreate={() => createTeam.mutate(teamId)}
                creating={createTeam.isPending && createTeam.variables === teamId}
              />
            );
          })}
        </div>
      </section>

      {teamCount > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Group Captains
          </h2>
          {TEAM_IDS.filter((id) => teams.data?.has(id)).map((teamId) => {
            const team = teams.data!.get(teamId)!;
            const currentUid = team.groupCaptainUid;
            const members = allPlayers.filter((p) => p.teamId === teamId);
            const current = members.find((p) =>
              p.kind === 'claimed' ? p.uid === currentUid : false,
            );
            return (
              <div key={teamId} className="rounded-2xl border border-line bg-bg-card p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                  {TEAM_LABEL[teamId]} · {members.length} member{members.length === 1 ? '' : 's'}
                </p>
                {members.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-mute">
                    Assign players to this team first (below).
                  </p>
                ) : (
                  <select
                    value={current && current.kind === 'claimed' ? current.uid : ''}
                    onChange={(e) =>
                      setGroupCaptain.mutate({ teamId, uid: e.target.value || null })
                    }
                    className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">— No Group Captain —</option>
                    {members
                      .filter((m): m is Extract<RosterEntry, { kind: 'claimed' }> => m.kind === 'claimed')
                      .map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                )}
                {members.filter((m) => m.kind === 'staged').length > 0 && (
                  <p className="mt-1 font-mono text-[10px] tracking-[0.06em] text-ink-mute">
                    Staged members can be made captain only after they sign in.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Assign Players
        </h2>
        {allPlayers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-mute">
            Import players in the Players tab first.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {allPlayers.map((p) => (
              <div
                key={p.kind === 'staged' ? `s-${p.id}` : `c-${p.uid}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-bg-card px-3 py-2.5"
              >
                <Avatar name={p.name} teamId={p.teamId ?? undefined} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                    {p.email}
                  </p>
                </div>
                <select
                  value={p.teamId ?? ''}
                  onChange={(e) => {
                    const next = (e.target.value || null) as TeamId | null;
                    if (next && !teams.data?.has(next)) return;
                    if (p.kind === 'staged') {
                      assignStagedToTeam.mutate({ stagedId: p.id, teamId: next });
                    } else {
                      assignClaimedToTeam.mutate({ uid: p.uid, teamId: next });
                    }
                  }}
                  className="rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-[11px] uppercase focus:border-accent focus:outline-none"
                >
                  <option value="">No team</option>
                  {TEAM_IDS.filter((id) => teams.data?.has(id)).map((id) => (
                    <option key={id} value={id}>
                      {TEAM_LABEL[id]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TeamCard({
  teamId,
  team,
  onCreate,
  creating,
}: {
  teamId: TeamId;
  team: TeamDoc | null;
  onCreate: () => void;
  creating: boolean;
}) {
  const color = TEAM_COLOR_VAR[teamId];
  if (team) {
    return (
      <div
        className="rounded-2xl border p-3"
        style={{ borderColor: 'color-mix(in oklab, currentColor 40%, transparent)', color }}
      >
        <p
          aria-hidden
          className="grid h-10 w-10 place-items-center rounded-full font-display text-sm text-bg"
          style={{ background: color }}
        >
          {TEAM_LABEL[teamId].slice(0, 2).toUpperCase()}
        </p>
        <p className="mt-2 font-display text-base uppercase">{TEAM_LABEL[teamId]}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-70">
          {team.members.length} player{team.members.length === 1 ? '' : 's'}
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={creating}
      className="flex flex-col items-start gap-1 rounded-2xl border border-dashed border-line bg-bg-card/40 p-3 text-left transition active:scale-[0.98]"
    >
      <span
        aria-hidden
        className="grid h-10 w-10 place-items-center rounded-full border border-dashed font-display text-sm text-ink-mute"
      >
        +
      </span>
      <span className="mt-2 font-display text-base uppercase">{TEAM_LABEL[teamId]}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
        {creating ? 'Creating…' : 'Tap to create'}
      </span>
    </button>
  );
}

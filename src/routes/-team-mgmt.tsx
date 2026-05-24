import { useState } from 'react';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Avatar } from '@/components/shared/Avatar';
import { CaptaincyRow, type CaptaincyCandidate } from '@/components/team-mgmt/CaptaincyRow';
import { TEAM_COLOR_VAR, TEAM_LABEL } from '@/types/team';


// Until step 8 wires admin import + team assignment, drive this from a
// fixed demo team. Replace with:
//   const team = useTeam(teamId) // events/{e}/teams/{teamId}
//   const members = useUsersByIds(team.members)
const DEMO_TEAM_ID = 'tridents' as const;
const DEMO_PLAYERS: readonly CaptaincyCandidate[] = [
  { uid: 'p1', name: 'Shah Mehta', teamId: DEMO_TEAM_ID },
  { uid: 'p2', name: 'Ravi Bose', teamId: DEMO_TEAM_ID },
  { uid: 'p3', name: 'Arjun Singh', teamId: DEMO_TEAM_ID },
  { uid: 'p4', name: 'Diya Roy', teamId: DEMO_TEAM_ID },
  { uid: 'p5', name: 'Kabir Lal', teamId: DEMO_TEAM_ID },
  { uid: 'p6', name: 'Nia Verma', teamId: DEMO_TEAM_ID },
  { uid: 'p7', name: 'Vik Patel', teamId: DEMO_TEAM_ID },
  { uid: 'p8', name: 'Mira Iyer', teamId: DEMO_TEAM_ID },
];

const SPORTS = [
  { id: 'football', name: 'Football' },
  { id: 'cricket', name: 'Cricket' },
  { id: 'badminton', name: 'Badminton' },
  { id: 'chess', name: 'Chess' },
] as const;

// The Group Captain (admin-assigned) — fixed for the demo. In the real screen
// this is read from teams/{id}.groupCaptainUid and is rendered as a locked row.
const DEMO_GROUP_CAPTAIN_UID = 'p1';

type Assignments = {
  viceCaptainUid: string | null;
  sportCaptains: Record<string, string | null>; // sportId → uid
};

const DEMO_INITIAL: Assignments = {
  viceCaptainUid: 'p3',
  sportCaptains: {
    football: 'p2',
    cricket: null,
    badminton: null,
    chess: null,
  },
};

export default function TeamMgmtScreen() {
  const [assignments, setAssignments] = useState<Assignments>(DEMO_INITIAL);
  const teamColor = TEAM_COLOR_VAR[DEMO_TEAM_ID];
  const teamLabel = TEAM_LABEL[DEMO_TEAM_ID];
  const groupCap = DEMO_PLAYERS.find((p) => p.uid === DEMO_GROUP_CAPTAIN_UID) ?? null;

  return (
    <>
      <TopBar title="Manage Team" />
      <main className="mx-auto max-w-[420px] pb-28">
        <DemoBanner />

        <section
          className="relative mx-5 mb-4 overflow-hidden rounded-3xl p-6 text-bg"
          style={{ background: `linear-gradient(135deg, ${teamColor}, #0f0e0c)` }}
        >
          <h2 className="font-display text-[40px] leading-none uppercase">{teamLabel}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] opacity-70">
            {DEMO_PLAYERS.length} players · You're the Group Captain
          </p>
        </section>

        <SectionTitle>Group Captain</SectionTitle>
        {groupCap ? (
          <div
            className="mx-5 mb-2 flex items-center gap-3 rounded-2xl border bg-bg-card px-3 py-2.5"
            style={{ borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)' }}
          >
            <Avatar
              name={groupCap.name}
              teamId={groupCap.teamId}
              isCaptain
              size={44}
              surfaceColor="var(--bg-card)"
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                Set by Admin
              </p>
              <p className="truncate font-display text-base uppercase">{groupCap.name}</p>
            </div>
            <span
              className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
              style={{
                color: 'var(--gold)',
                borderColor: 'color-mix(in oklab, var(--gold) 40%, transparent)',
              }}
            >
              Locked
            </span>
          </div>
        ) : null}

        <SectionTitle>Vice Captain</SectionTitle>
        <CaptaincyRow
          label="Vice Captain"
          badgeText="VC"
          accentColor="var(--gold)"
          candidates={DEMO_PLAYERS.filter((p) => p.uid !== DEMO_GROUP_CAPTAIN_UID)}
          assigneeUid={assignments.viceCaptainUid}
          onAssign={(uid) =>
            setAssignments((a) => ({ ...a, viceCaptainUid: uid }))
          }
        />

        <SectionTitle>Sport Captains</SectionTitle>
        {SPORTS.map((sport) => (
          <CaptaincyRow
            key={sport.id}
            label={`${sport.name} Captain`}
            badgeText="★"
            accentColor="var(--accent-3)"
            candidates={DEMO_PLAYERS}
            assigneeUid={assignments.sportCaptains[sport.id] ?? null}
            onAssign={(uid) =>
              setAssignments((a) => ({
                ...a,
                sportCaptains: { ...a.sportCaptains, [sport.id]: uid },
              }))
            }
          />
        ))}

        <SectionTitle>Roster</SectionTitle>
        <div className="mx-5 grid grid-cols-4 gap-2">
          {DEMO_PLAYERS.map((p) => {
            const isGroupCap = p.uid === DEMO_GROUP_CAPTAIN_UID;
            const isVC = p.uid === assignments.viceCaptainUid;
            const scOf = Object.entries(assignments.sportCaptains).find(
              ([, uid]) => uid === p.uid,
            )?.[0];
            const tag = isGroupCap
              ? { text: 'GROUP CAP', color: 'var(--gold)' }
              : isVC
                ? { text: 'VICE CAP', color: 'var(--gold)' }
                : scOf
                  ? { text: `★ ${scOf.toUpperCase()}`, color: 'var(--accent-3)' }
                  : null;
            return (
              <div key={p.uid} className="flex flex-col items-center gap-1.5">
                <Avatar
                  name={p.name}
                  teamId={p.teamId}
                  size={56}
                  isCaptain={isGroupCap}
                  surfaceColor="var(--bg)"
                />
                <span className="font-display text-[11px] uppercase leading-none tracking-[0.06em]">
                  {p.name.split(' ')[0]}
                </span>
                {tag ? (
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.06em]"
                    style={{ color: tag.color }}
                  >
                    {tag.text}
                  </span>
                ) : (
                  <span className="h-[12px]" />
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

function DemoBanner() {
  return (
    <div
      className="mx-5 mb-3 rounded-xl border border-dashed px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
      style={{
        color: 'var(--accent-2)',
        borderColor: 'color-mix(in oklab, var(--accent-2) 40%, transparent)',
        background: 'color-mix(in oklab, var(--accent-2) 6%, transparent)',
      }}
    >
      Demo data · live wiring lands in step 8
    </div>
  );
}

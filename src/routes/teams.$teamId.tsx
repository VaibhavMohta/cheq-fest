import { useEffect, useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { onSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { BackIcon } from '@/components/shared/icons';
import { useActiveEvent } from '@/lib/activeEvent';
import { teamRef } from '@/lib/db';
import { colorVarFor } from '@/types/team';
import type { TeamDoc } from '@/types/player';

export const Route = createFileRoute('/teams/$teamId')({
  component: TeamDetailScreen,
});

function TeamDetailScreen() {
  const { teamId } = Route.useParams();
  const router = useRouter();
  const { activeEventId } = useActiveEvent();
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeEventId) {
      setTeam(null);
      setLoaded(true);
      return;
    }
    return onSnapshot(teamRef(activeEventId, teamId), (snap) => {
      setTeam(snap.exists() ? snap.data() : null);
      setLoaded(true);
    });
  }, [activeEventId, teamId]);

  // Team-not-found state. Catches:
  //  - No active event selected
  //  - Stale link to a deleted team
  //  - User typed a bad slug
  if (loaded && !team) {
    return (
      <>
        <TopBar
          title="Team"
          accentLast={false}
          actions={
            <IconButton aria-label="Back" onClick={() => router.history.back()}>
              <BackIcon />
            </IconButton>
          }
        />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="Team not found"
            hint={
              activeEventId
                ? `No team with id "${teamId}" in this event. It may have been deleted.`
                : 'Pick an active event from the top bar first.'
            }
          />
        </main>
      </>
    );
  }

  if (!team) {
    return (
      <>
        <TopBar title="Team" accentLast={false} />
        <main className="mx-auto max-w-[420px] pb-28">
          <p className="px-5 text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  const teamColor = colorVarFor(team.color);

  return (
    <>
      <TopBar
        title={team.name}
        accentLast={false}
        actions={
          <IconButton aria-label="Back" onClick={() => router.history.back()}>
            <BackIcon />
          </IconButton>
        }
      />
      <main className="mx-auto max-w-[420px] pb-28">
        <section
          className="relative mx-5 overflow-hidden rounded-3xl p-6 text-bg"
          style={{ background: `linear-gradient(135deg, ${teamColor}, #0f0e0c)` }}
        >
          <h2 className="font-display text-[40px] leading-none uppercase">{team.name}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] opacity-70">
            {team.members.length} player{team.members.length === 1 ? '' : 's'}
            {team.groupCaptainEmail ? ' · GC assigned' : ' · No Group Captain'}
          </p>
        </section>

        <SectionTitle>Captains</SectionTitle>
        {team.groupCaptainEmail ? (
          <p className="mx-5 rounded-xl border border-line bg-bg-card px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim">
            Group Captain · {team.groupCaptainEmail}
          </p>
        ) : (
          <EmptyState
            title="No captain yet"
            hint="Admin assigns the Group Captain from the admin Teams tab."
          />
        )}

        <SectionTitle>Roster</SectionTitle>
        {team.members.length === 0 ? (
          <EmptyState
            title="No players assigned"
            hint="Players get assigned to teams from the admin Players + Teams tabs."
          />
        ) : (
          <ul className="mx-5 flex flex-col gap-1.5">
            {team.members.map((email) => (
              <li
                key={email}
                className="rounded-xl border border-line bg-bg-card px-3 py-2 font-mono text-[11px] tracking-[0.06em] text-ink"
              >
                {email}
              </li>
            ))}
          </ul>
        )}

        <SectionTitle>Points by Sport</SectionTitle>
        <EmptyState title={`${team.totalPoints} pts`} hint="Points appear here as matches finalize." />
      </main>
    </>
  );
}

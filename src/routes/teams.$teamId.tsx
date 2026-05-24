import { createFileRoute, useRouter } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { BackIcon } from '@/components/shared/icons';
import { TEAM_COLOR_VAR, TEAM_IDS, TEAM_LABEL, type TeamId } from '@/types/team';

export const Route = createFileRoute('/teams/$teamId')({
  parseParams: ({ teamId }) => {
    if (!isTeamId(teamId)) throw new Error(`Unknown team "${teamId}"`);
    return { teamId };
  },
  stringifyParams: ({ teamId }) => ({ teamId }),
  component: TeamDetailScreen,
});

function isTeamId(value: string): value is TeamId {
  return (TEAM_IDS as readonly string[]).includes(value);
}

function TeamDetailScreen() {
  const { teamId } = Route.useParams();
  const router = useRouter();
  const teamColor = TEAM_COLOR_VAR[teamId];
  const teamLabel = TEAM_LABEL[teamId];

  return (
    <>
      <TopBar
        title={teamLabel}
        accentLast={false}
        actions={
          <IconButton aria-label="Back" onClick={() => router.history.back()}>
            <BackIcon />
          </IconButton>
        }
      />
      <main className="mx-auto max-w-[420px] pb-28">
        <section
          className="mx-5 overflow-hidden rounded-3xl p-6 text-bg"
          style={{ background: `linear-gradient(135deg, ${teamColor}, #0f0e0c)` }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-8 top-12 font-display text-[96px] leading-none opacity-20"
          >
            ?
          </span>
          <h2 className="font-display text-[40px] leading-none uppercase">{teamLabel}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] opacity-70">
            Roster not yet assigned · admin sets up teams
          </p>
        </section>

        <SectionTitle>Captains</SectionTitle>
        <EmptyState
          title="Captains TBD"
          hint="Admin assigns the Group Captain; Group Captain then picks Sport Captains."
        />

        <SectionTitle>Roster</SectionTitle>
        <EmptyState
          title="No players assigned"
          hint="Players get assigned to teams from the admin Players + Teams tabs."
        />

        <SectionTitle>Points by Sport</SectionTitle>
        <EmptyState title="0 pts" hint="Points appear here as matches finalize." />
      </main>
    </>
  );
}

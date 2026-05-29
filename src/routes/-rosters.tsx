import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, onSnapshot } from 'firebase/firestore';
import clsx from 'clsx';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { EventBar } from '@/components/shared/EventBar';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers } from '@/lib/playerDirectory';
import { rostersCol, sportsCol, teamsCol, type RosterDoc } from '@/lib/db';
import { colorVarFor, inkOnTeamColor, isLightTeamColor, teamTextOnPage } from '@/types/team';
import { SportIcon } from '@/components/shared/SportIcon';
import type { SportDoc } from '@/types/sport';
import type { TeamDoc } from '@/types/player';

type RosterRow = RosterDoc & { sportId: string; teamId: string };

/**
 * Public team-by-sport roster view. Renders each team's lineups for
 * every sport, with the configured buckets (On The Pitch, Tentative,
 * Substitutes). Teams + sports without a finalised lineup show a
 * 'Lineup to be selected by captains' placeholder so spectators see
 * the gap clearly. Filter by team with the pill row at the top.
 */
export default function RostersScreen() {
  const { activeEventId } = useActiveEvent();
  const { people } = useAllEventPlayers();
  const [teamFilter, setTeamFilter] = useState<string>(''); // '' = All teams

  const [teams, setTeams] = useState<(TeamDoc & { id: string })[]>([]);
  useEffect(() => {
    if (!activeEventId) {
      setTeams([]);
      return;
    }
    return onSnapshot(teamsCol(activeEventId), (snap) => {
      setTeams(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      );
    });
  }, [activeEventId]);

  const [sports, setSports] = useState<(SportDoc & { id: string })[]>([]);
  useEffect(() => {
    if (!activeEventId) {
      setSports([]);
      return;
    }
    return onSnapshot(sportsCol(activeEventId), (snap) => {
      setSports(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      );
    });
  }, [activeEventId]);

  // Fan-out per-team roster fetches. Same pattern as /players — one-shot
  // via TanStack Query, not subscribed, since rosters change infrequently
  // and a sub on every team×sport would re-render the page too often.
  const rosters = useQuery({
    queryKey: ['rosters-screen', activeEventId, teams.map((t) => t.id).join(',')],
    enabled: !!activeEventId && teams.length > 0,
    queryFn: async () => {
      if (!activeEventId) return new Map<string, RosterRow[]>();
      const m = new Map<string, RosterRow[]>();
      await Promise.all(
        teams.map(async (t) => {
          const snap = await getDocs(rostersCol(activeEventId, t.id));
          m.set(
            t.id,
            snap.docs.map((d) => ({ ...d.data(), sportId: d.id, teamId: t.id })),
          );
        }),
      );
      return m;
    },
  });

  // Map email → display name for resolving roster entries.
  const nameByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.email.toLowerCase(), p.name);
    return m;
  }, [people]);

  // Apply the team filter (or show all). Order = alphabetical by name.
  const visibleTeams = useMemo(() => {
    if (!teamFilter) return teams;
    return teams.filter((t) => t.id === teamFilter);
  }, [teams, teamFilter]);

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Rosters" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see rosters."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Rosters" />
      <main className="mx-auto max-w-[420px] pb-28">
        <EventBar />

        {/* Team filter pills. 'All teams' is the default; tap a team
            chip to focus on just that team. Each chip tints with the
            team's stored color for quick recognition. */}
        <div className="mx-5 mb-3 flex gap-1.5 overflow-x-auto">
          <FilterPill
            label="All teams"
            color={null}
            active={teamFilter === ''}
            onClick={() => setTeamFilter('')}
          />
          {teams.map((t) => (
            <FilterPill
              key={t.id}
              label={t.name}
              color={t.color}
              active={teamFilter === t.id}
              onClick={() => setTeamFilter(t.id)}
            />
          ))}
        </div>

        {teams.length === 0 ? (
          <EmptyState
            title="No teams yet"
            hint="Admin will create teams from the admin tab."
          />
        ) : sports.length === 0 ? (
          <EmptyState
            title="No sports yet"
            hint="Admin will add sports from the admin tab."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {visibleTeams.map((team) => (
              <TeamRosterBlock
                key={team.id}
                team={team}
                sports={sports}
                rosters={rosters.data?.get(team.id) ?? []}
                nameByEmail={nameByEmail}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string | null;
  active: boolean;
  onClick: () => void;
}) {
  const accent = color ? colorVarFor(color) : 'var(--accent)';
  // Active state fills with the team color so identity is unmistakable;
  // text uses ink-on-team so dark teams (black/navy/slate) and light
  // teams (yellow/lime/white) are both legible. Inactive state stays
  // subdued — a faint tinted card with the team color as accent text,
  // but dark teams fall back to ink so the chip is readable on the
  // dark page bg.
  const inactiveFg = color && !isLightTeamColor(color) ? 'var(--ink)' : accent;
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] transition"
      style={{
        borderColor: active ? accent : 'color-mix(in oklab, ' + accent + ' 35%, var(--line))',
        background: active
          ? accent
          : `color-mix(in oklab, ${accent} 8%, var(--bg-card))`,
        color: active ? inkOnTeamColor(color) : color ? inactiveFg : 'var(--ink-dim)',
      }}
    >
      {label}
    </button>
  );
}

function TeamRosterBlock({
  team,
  sports,
  rosters,
  nameByEmail,
}: {
  team: TeamDoc & { id: string };
  sports: (SportDoc & { id: string })[];
  rosters: RosterRow[];
  nameByEmail: Map<string, string>;
}) {
  const teamColor = colorVarFor(team.color);
  const rosterBySport = new Map(rosters.map((r) => [r.sportId, r]));

  // Count sports with at least one player on pitch — used in the
  // header summary so users can scan "5 of 10 lineups set".
  const lockedIn = sports.reduce((acc, s) => {
    const r = rosterBySport.get(s.id);
    return acc + ((r?.pitch?.length ?? 0) > 0 ? 1 : 0);
  }, 0);

  return (
    <section>
      <header
        className="mx-5 mb-2 flex items-center gap-3 rounded-2xl border px-4 py-3"
        style={{
          borderColor: teamColor,
          background: `color-mix(in oklab, ${teamColor} 8%, var(--bg-card))`,
        }}
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: teamColor }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-display text-lg uppercase"
            style={{ color: teamTextOnPage(team.color) }}
          >
            {team.name}
          </p>
          {team.groupCaptainEmail && (
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
              GC ·{' '}
              {nameByEmail.get(team.groupCaptainEmail.toLowerCase()) ??
                team.groupCaptainEmail.split('@')[0]}
            </p>
          )}
        </div>
        <p
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]"
          style={{ color: lockedIn === sports.length ? 'var(--accent-2)' : 'var(--ink-dim)' }}
        >
          {lockedIn}/{sports.length} set
        </p>
      </header>

      <div className="mx-5 flex flex-col gap-2">
        {sports.map((sport) => {
          const roster = rosterBySport.get(sport.id);
          return (
            <SportRosterRow
              key={sport.id}
              sport={sport}
              roster={roster}
              nameByEmail={nameByEmail}
              teamColor={teamColor}
            />
          );
        })}
      </div>
    </section>
  );
}

function SportRosterRow({
  sport,
  roster,
  nameByEmail,
  teamColor,
}: {
  sport: SportDoc & { id: string };
  roster: RosterRow | undefined;
  nameByEmail: Map<string, string>;
  teamColor: string;
}) {
  // "Lineup set" means at least one player on the pitch. Pure-tentative
  // / pure-substitute rosters are treated as not-yet-finalised — the
  // pitch is what actually shows up to play.
  const hasLineup = (roster?.pitch?.length ?? 0) > 0;
  const sportCaptainEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;

  return (
    <article className="rounded-xl border border-line bg-bg-card px-3 py-2.5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 truncate font-display text-sm uppercase">
          <SportIcon sportName={sport.name} arenaType={sport.arenaType} size={14} />
          {sport.name}
        </h3>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute">
          {sport.playersOnField} on field · {sport.substitutes} sub
        </p>
      </header>

      {!hasLineup ? (
        <p
          className="mt-1.5 rounded-lg border border-dashed px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.06em]"
          style={{
            color: 'var(--accent)',
            borderColor: 'color-mix(in oklab, var(--accent) 50%, transparent)',
            background: 'color-mix(in oklab, var(--accent) 6%, transparent)',
          }}
        >
          Lineup to be selected by captains
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <Bucket
            label="On the pitch"
            emails={roster?.pitch ?? []}
            cap={sport.playersOnField}
            captain={sportCaptainEmail}
            nameByEmail={nameByEmail}
            color="var(--accent)"
            teamColor={teamColor}
          />
          {(roster?.tentative?.length ?? 0) > 0 && (
            <Bucket
              label="Tentative"
              emails={roster?.tentative ?? []}
              captain={sportCaptainEmail}
              nameByEmail={nameByEmail}
              color="var(--accent-2)"
              teamColor={teamColor}
            />
          )}
          {(roster?.substitutes?.length ?? 0) > 0 && (
            <Bucket
              label="Substitutes"
              emails={roster?.substitutes ?? []}
              cap={sport.substitutes}
              captain={sportCaptainEmail}
              nameByEmail={nameByEmail}
              color="var(--accent-3)"
              teamColor={teamColor}
            />
          )}
        </div>
      )}
    </article>
  );
}

function Bucket({
  label,
  emails,
  cap,
  captain,
  nameByEmail,
  color,
  teamColor,
}: {
  label: string;
  emails: string[];
  cap?: number;
  captain: string | null;
  nameByEmail: Map<string, string>;
  color: string;
  teamColor: string;
}) {
  if (emails.length === 0) return null;
  return (
    <div>
      <p className="flex items-baseline gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]">
        <span style={{ color }}>{label}</span>
        <span className="text-ink-mute">
          {emails.length}
          {cap != null && `/${cap}`}
        </span>
      </p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {emails.map((rawEmail) => {
          const email = rawEmail.toLowerCase();
          const name = nameByEmail.get(email) ?? email.split('@')[0] ?? email;
          const isCaptain = captain === email;
          return (
            <li
              key={email}
              className={clsx(
                'flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px]',
              )}
              style={{
                borderColor: isCaptain
                  ? 'var(--accent-3)'
                  : 'color-mix(in oklab, var(--line) 80%, transparent)',
                background: 'var(--bg)',
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: teamColor }}
              />
              <span className="text-ink">{name}</span>
              {isCaptain && (
                <span
                  aria-label="Sport Captain"
                  className="font-mono text-[8px] uppercase tracking-[0.06em]"
                  style={{ color: 'var(--accent-3)' }}
                >
                  · SC
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

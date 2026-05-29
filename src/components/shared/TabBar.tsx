import clsx from 'clsx';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import {
  ArenaIcon,
  HomeIcon,
  LeaderboardIcon,
  PlayersIcon,
  ProfileIcon,
  RefereeIcon,
  RostersIcon,
} from './icons';

type Item = {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const ITEMS: readonly Item[] = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/arena', label: 'Arena', Icon: ArenaIcon },
  { to: '/leaderboard', label: 'Board', Icon: LeaderboardIcon },
  { to: '/players', label: 'Players', Icon: PlayersIcon },
  { to: '/rosters', label: 'Rosters', Icon: RostersIcon },
  { to: '/referee', label: 'Ref', Icon: RefereeIcon },
  // Rules moved into the Me / Profile screen so the bottom nav stays
  // tight; rules tile renders for everyone (incl. signed-out users).
  { to: '/profile', label: 'Me', Icon: ProfileIcon },
];

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-7 gap-1 rounded-3xl border border-line p-2"
      style={{
        background: 'color-mix(in oklab, var(--bg-card) 92%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {ITEMS.map(({ to, label, Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={clsx(
              'flex flex-col items-center gap-0.5 rounded-2xl px-0 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.03em] transition',
              active ? 'text-accent' : 'text-ink-dim',
            )}
            style={
              active
                ? { background: 'color-mix(in oklab, var(--accent) 12%, transparent)' }
                : undefined
            }
          >
            <Icon width={16} height={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

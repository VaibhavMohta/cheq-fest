import clsx from 'clsx';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import { ArenaIcon, HomeIcon, LeaderboardIcon, ProfileIcon, RulebookIcon } from './icons';

type Item = {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const ITEMS: readonly Item[] = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/arena', label: 'Arena', Icon: ArenaIcon },
  { to: '/leaderboard', label: 'Board', Icon: LeaderboardIcon },
  { to: '/rulebook', label: 'Rules', Icon: RulebookIcon },
  { to: '/profile', label: 'Me', Icon: ProfileIcon },
];

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 gap-1 rounded-3xl border border-line p-2"
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
              'flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] transition',
              active ? 'text-accent' : 'text-ink-dim',
            )}
            style={
              active
                ? { background: 'color-mix(in oklab, var(--accent) 12%, transparent)' }
                : undefined
            }
          >
            <Icon width={20} height={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

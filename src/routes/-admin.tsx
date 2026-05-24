import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { AdminTabs, type AdminTab } from '@/components/admin/AdminTabs';
import { EventTab } from '@/components/admin/EventTab';
import { PlayersTab } from '@/components/admin/PlayersTab';
import { TeamsTab } from '@/components/admin/TeamsTab';
import { SportsTab } from '@/components/admin/SportsTab';
import { MatchesTab } from '@/components/admin/MatchesTab';
import { RulebookTab } from '@/components/admin/RulebookTab';
import { useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';

export default function AdminScreen() {
  const authState = useAuth();
  const role = useRole();
  const [tab, setTab] = useState<AdminTab>('Event');

  if (authState.status === 'loading') {
    return (
      <>
        <TopBar title="Event Setup" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  if (authState.status === 'signedOut') {
    return (
      <>
        <TopBar title="Event Setup" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-4 px-5 pb-28">
          <p className="text-ink-dim">Sign in to access admin setup.</p>
          <Link
            to="/login"
            className="rounded-2xl bg-accent px-4 py-3 text-center font-display text-base uppercase tracking-wide text-bg"
          >
            Sign in
          </Link>
        </main>
      </>
    );
  }

  if (!role.is('admin') && !role.is('super-admin')) {
    return (
      <>
        <TopBar title="Event Setup" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-3 px-5 pb-28">
          <p className="font-display text-2xl uppercase">Admin only</p>
          <p className="text-ink-dim">
            This screen is for event admins. If you should have access, ask the Super Admin
            to grant your account the admin role.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Event Setup" />
      <main className="mx-auto max-w-[420px] pb-28">
        <AdminTabs current={tab} onChange={setTab} />
        {tab === 'Event' && <EventTab />}
        {tab === 'Players' && <PlayersTab />}
        {tab === 'Teams' && <TeamsTab />}
        {tab === 'Sports' && <SportsTab />}
        {tab === 'Matches' && <MatchesTab />}
        {tab === 'Rulebook' && <RulebookTab />}
      </main>
    </>
  );
}

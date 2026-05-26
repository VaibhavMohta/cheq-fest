import { Link, createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { QuickActionTile } from '@/components/shared/QuickActionTile';
import { signOut, useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';

export const Route = createFileRoute('/profile')({
  component: ProfileScreen,
});

function ProfileScreen() {
  const authState = useAuth();
  const role = useRole();

  if (authState.status === 'loading') {
    return (
      <>
        <TopBar title="My Profile" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  if (authState.status === 'signedOut') {
    return (
      <>
        <TopBar title="My Profile" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-6 px-5 pb-28">
          <p className="text-ink-dim">
            You're browsing as a guest. Sign in with your CHEQ account to see your team,
            stats, and any captain or referee duties.
          </p>
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

  const { user } = authState;
  const isRef = role.perMatchReferee.length > 0;

  return (
    <>
      <TopBar title="My Profile" />
      <main className="mx-auto max-w-[420px] pb-28">
        <header className="mx-5 flex items-center gap-4">
          <Avatar
            name={user.displayName}
            googlePhotoUrl={user.photoURL}
            size={80}
            isCaptain={role.is('group-cap')}
            surfaceColor="var(--bg)"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-2xl uppercase">
              {user.displayName ?? 'CHEQ User'}
            </p>
            <p className="truncate font-mono text-xs text-ink-dim">{user.email}</p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {Array.from(role.all).map((r) => (
                <RoleTag key={r} role={r} />
              ))}
            </p>
          </div>
        </header>

        <SectionTitle>Stats</SectionTitle>
        <div className="mx-5 grid grid-cols-3 gap-2">
          <StatCard label="Matches" value="0" />
          <StatCard label="Wins" value="0" />
          <StatCard label="Points" value="0" />
        </div>
        <p className="mx-5 mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          Stats appear after your first finalized match.
        </p>

        <SectionTitle>Quick Actions</SectionTitle>
        <div className="mx-5 flex flex-col gap-2">
          <QuickActionTile to="/leaderboard" label="My Team" sub="Standings + roster" />
          <QuickActionTile to="/arena" label="Live Now" sub="Animated arena" />

          {(isRef || role.is('admin') || role.is('super-admin')) && (
            <QuickActionTile
              to="/referee"
              label="Referee Console"
              sub={
                isRef
                  ? `${role.perMatchReferee.length} match${role.perMatchReferee.length === 1 ? '' : 'es'} assigned`
                  : 'Admin · all matches'
              }
              accent="primary"
            />
          )}
          {role.is('sport-cap') && (
            <QuickActionTile
              to="/lineup"
              label="Edit Lineup"
              sub="Sport Captain"
              accent="cyan"
            />
          )}
          {role.is('group-cap') && (
            <QuickActionTile
              to="/team-mgmt"
              label="Manage Team"
              sub="Group Captain"
              accent="gold"
            />
          )}
          {(role.is('admin') || role.is('super-admin')) && (
            <>
              <QuickActionTile
                to="/admin"
                label="Event Setup"
                sub="Players · Teams · Sports · Rulebook"
                accent="primary"
              />
              <QuickActionTile
                to="/score-entry"
                label="Post Score"
                sub="Step 10"
                accent="primary"
                disabled
              />
            </>
          )}
          {role.is('super-admin') && (
            <QuickActionTile
              to="/manage-admins"
              label="Manage Admins"
              sub="Grant / revoke admin"
              accent="gold"
            />
          )}
        </div>

        <div className="mx-5 mt-8">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-card px-3 py-4 text-center">
      <p className="font-display text-3xl leading-none">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">{label}</p>
    </div>
  );
}

const ROLE_LABELS: Record<string, { text: string; color: string }> = {
  'super-admin': { text: 'SUPER ADMIN', color: 'var(--gold)' },
  admin: { text: 'ADMIN', color: 'var(--accent)' },
  'group-cap': { text: 'GROUP CAP', color: 'var(--gold)' },
  'sport-cap': { text: 'SPORT CAP', color: 'var(--accent-3)' },
  player: { text: 'PLAYER', color: 'var(--ink-dim)' },
};

function RoleTag({ role }: { role: string }) {
  const entry = ROLE_LABELS[role];
  if (!entry) return null;
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
      style={{ color: entry.color, borderColor: 'color-mix(in oklab, currentColor 40%, transparent)' }}
    >
      {entry.text}
    </span>
  );
}

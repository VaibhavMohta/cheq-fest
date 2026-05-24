import { Link, createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';
import { IconButton } from '@/components/shared/IconButton';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { MenuIcon } from '@/components/shared/icons';

export const Route = createFileRoute('/')({
  component: HomeScreen,
});

// Until admin event setup lands (step 8), public screens read no data —
// they render empty states. Once Firestore is wired (step 5+), these arrays
// become onSnapshot queries.
const liveMatches: never[] = [];
const todaysMatches: never[] = [];
const standings: never[] = [];

function HomeScreen() {
  return (
    <>
      <TopBar
        title="CHEQ Fest"
        actions={
          <IconButton aria-label="Menu">
            <MenuIcon />
          </IconButton>
        }
      />
      <main className="mx-auto max-w-[420px] pb-28">
        <InstallPrompt />
        <Hero />

        <SectionTitle trailing={liveMatches.length === 0 ? undefined : 'ALL →'}>
          Live Now
        </SectionTitle>
        {liveMatches.length === 0 ? (
          <EmptyState
            title="No live matches"
            hint="Live cards appear here the moment a referee starts a match."
          />
        ) : null}

        <SectionTitle>Today</SectionTitle>
        {todaysMatches.length === 0 ? (
          <EmptyState
            title="Schedule not posted"
            hint="Admin will publish the match schedule once teams are confirmed."
          />
        ) : null}

        <SectionTitle trailing={<Link to="/leaderboard">FULL BOARD →</Link>}>
          Standings
        </SectionTitle>
        {standings.length === 0 ? (
          <EmptyState
            title="No scores yet"
            hint="Standings update automatically as matches finish."
          />
        ) : null}

        <SectionTitle trailing={<Link to="/rulebook">OPEN →</Link>}>The Rulebook</SectionTitle>
        <Link
          to="/rulebook"
          className="mx-5 flex items-center gap-4 rounded-2xl border border-line bg-bg-card px-4 py-4 active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="grid h-12 w-14 place-items-center rounded-lg bg-accent font-display text-xs text-bg"
          >
            PDF
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Rules & Points</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              Sport configs + scoring · always up to date
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">
            →
          </span>
        </Link>
      </main>
    </>
  );
}

function Hero() {
  return (
    <section
      className="mx-5 mt-2 overflow-hidden rounded-[28px] border border-line p-6"
      style={{
        background:
          'radial-gradient(ellipse at top right, color-mix(in oklab, var(--accent-2) 15%, transparent), transparent 50%), linear-gradient(135deg, #1a1815, #0f0e0c)',
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
        Pre-event · setup in progress
      </p>
      <h2 className="mt-3 font-display text-[52px] leading-none uppercase">
        CHEQ
        <br />
        Sports <span className="text-accent">'26</span>
      </h2>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
        Dates TBA · Bengaluru HQ
      </p>
      <div className="mt-5 flex gap-6">
        <Stat value="—" label="Sports" />
        <Stat value="—" label="Teams" />
        <Stat value="—" label="Players" />
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
    </div>
  );
}

import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { CaptainBadge } from '@/components/shared/CaptainBadge';
import { Chip } from '@/components/shared/Chip';
import { IconButton } from '@/components/shared/IconButton';
import { TopBar } from '@/components/shared/TopBar';
import { BackIcon, MenuIcon } from '@/components/shared/icons';

// Generic palette samples for the avatar showcase below — these are just
// hex strings, not team ids. Components/admin/TeamsTab.tsx ships the real
// palette; we only need a few visually distinct hexes here.
const SAMPLE_COLORS: { hex: string; label: string }[] = [
  { hex: '#ff4a1c', label: 'Lava' },
  { hex: '#e8ff4a', label: 'Lime' },
  { hex: '#4ad4ff', label: 'Cyan' },
  { hex: '#ff4ad0', label: 'Pink' },
];


export default function ComponentsShowcase() {
  return (
    <>
      <TopBar
        title="Dev Components"
        actions={
          <>
            <IconButton aria-label="Back">
              <BackIcon />
            </IconButton>
            <IconButton aria-label="Menu" active>
              <MenuIcon />
            </IconButton>
          </>
        }
      />
      <main className="mx-auto flex max-w-[420px] flex-col gap-8 px-5 pb-28">
        <Section title="Avatars · team colors · captain badge">
          <div className="flex flex-wrap items-end gap-4">
            {SAMPLE_COLORS.map((c) => (
              <Stack key={c.hex} label={c.label}>
                <Avatar name="Shah Mehta" teamId={c.hex} size={56} />
              </Stack>
            ))}
            <Stack label="No team">
              <Avatar name="Riya N" size={56} />
            </Stack>
            <Stack label="Captain">
              <Avatar name="Arjun S" teamId={SAMPLE_COLORS[0]!.hex} size={56} isCaptain />
            </Stack>
            <Stack label="Photo (Google)">
              <Avatar
                name="Photo Test"
                teamId={SAMPLE_COLORS[2]!.hex}
                size={56}
                googlePhotoUrl="https://i.pravatar.cc/96?img=12"
              />
            </Stack>
          </div>
        </Section>

        <Section title="Avatars · sizes (arena→profile hero)">
          <div className="flex flex-wrap items-end gap-4">
            {[32, 38, 44, 56, 80, 88].map((size) => (
              <Stack key={size} label={`${size}px`}>
                <Avatar
                  name="Kira Vee"
                  teamId={SAMPLE_COLORS[1]!.hex}
                  size={size}
                  isCaptain={size >= 56}
                  surfaceColor="var(--bg-card)"
                />
              </Stack>
            ))}
          </div>
        </Section>

        <Section title="CaptainBadge alone">
          <div className="flex items-center gap-6 rounded-2xl bg-bg-card p-4">
            <div className="relative h-14 w-14 rounded-full bg-ink-mute">
              <CaptainBadge size="md" ringColor="var(--bg-card)" />
            </div>
            <div className="relative h-9 w-9 rounded-full bg-ink-mute">
              <CaptainBadge size="sm" ringColor="var(--bg-card)" />
            </div>
            <span className="font-mono text-xs text-ink-dim">
              same shape as the one on the avatar
            </span>
          </div>
        </Section>

        <Section title="Chips">
          <div className="flex flex-wrap gap-2">
            <Chip variant="live">Live</Chip>
            <Chip variant="upcoming">Today 4:30 PM</Chip>
            <Chip variant="done">Final</Chip>
            <Chip variant="neutral">Group A</Chip>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-col gap-3">
            <Button variant="primary">Continue</Button>
            <Button variant="ghost">Sign out</Button>
            <Button variant="primary" disabled>
              Disabled CTA
            </Button>
          </div>
        </Section>

        <Section title="IconButton">
          <div className="flex gap-2">
            <IconButton aria-label="Back">
              <BackIcon />
            </IconButton>
            <IconButton aria-label="Menu">
              <MenuIcon />
            </IconButton>
            <IconButton aria-label="Active" active>
              <MenuIcon />
            </IconButton>
          </div>
        </Section>

        <Section title="TabBar">
          <p className="font-mono text-xs text-ink-dim">
            Floating bottom nav is mounted on every screen except <code>/login</code>.
            Scroll to the bottom to see it.
          </p>
        </Section>

        <Section title="Interactive">
          <div className="flex flex-col gap-2">
            <a
              href="/lineup"
              className="rounded-xl border border-line bg-bg-card px-4 py-3 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-dim"
            >
              /lineup · drag-and-drop demo →
            </a>
            <a
              href="/team-mgmt"
              className="rounded-xl border border-line bg-bg-card px-4 py-3 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-dim"
            >
              /team-mgmt · group cap assignments →
            </a>
            <a
              href="/arena"
              className="rounded-xl border border-line bg-bg-card px-4 py-3 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-dim"
            >
              /arena · animated arenas →
            </a>
            <a
              href="/referee"
              className="rounded-xl border border-line bg-bg-card px-4 py-3 font-mono text-[11px] tracking-[0.12em] uppercase text-ink-dim"
            >
              /referee · live console →
            </a>
          </div>
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">{title}</h2>
      {children}
    </section>
  );
}

function Stack({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="font-mono text-[10px] text-ink-dim">{label}</span>
    </div>
  );
}

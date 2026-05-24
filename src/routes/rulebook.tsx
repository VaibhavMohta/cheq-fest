import { createFileRoute } from '@tanstack/react-router';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { EmptyState } from '@/components/shared/EmptyState';

export const Route = createFileRoute('/rulebook')({
  component: RulebookScreen,
});

// Once a rulebook is parsed, this becomes a Firestore read of events/{id}/sports.
const sports: never[] = [];
const pdfMeta: { title: string; meta: string; url: string } | null = null;

function RulebookScreen() {
  return (
    <>
      <TopBar title="The Rulebook" />
      <main className="mx-auto max-w-[420px] pb-28">
        <section
          className="mx-5 mb-4 flex items-center gap-4 rounded-2xl border border-line p-5"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card), var(--bg-elev))',
          }}
        >
          <span
            aria-hidden
            className="grid h-16 w-14 shrink-0 place-items-center rounded-lg bg-accent font-display text-xs text-bg"
          >
            PDF
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {pdfMeta?.title ?? 'CHEQ Fest — Rulebook'}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              {pdfMeta?.meta ?? 'Not uploaded yet'}
            </p>
          </div>
        </section>

        <SectionTitle>Points System</SectionTitle>
        {sports.length === 0 ? (
          <EmptyState
            title="No sports parsed"
            hint="Admin uploads the rulebook PDF and AI parses sport configs + points."
          />
        ) : null}

        <SectionTitle>Quick Rules</SectionTitle>
        {sports.length === 0 ? (
          <EmptyState
            title="Nothing to read yet"
            hint="Sport summaries appear here after the admin confirms the parsed rulebook."
          />
        ) : null}
      </main>
    </>
  );
}

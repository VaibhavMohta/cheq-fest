import { useEffect, useState } from 'react';

// The browser fires `beforeinstallprompt` once it decides the PWA is
// installable. We grab the event, suppress the default mini-infobar, and
// show our own banner. Dismissal is remembered in localStorage so we don't
// nag the user every visit.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'cheq-fest:install-dismissed';

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handler(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    }
    function installed() {
      setEvent(null);
      localStorage.setItem(DISMISS_KEY, '1');
    }

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (!event || dismissed) return null;

  return (
    <div
      className="mx-5 mb-3 flex items-center gap-3 rounded-2xl border p-3"
      style={{
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 18%, var(--bg-card)), var(--bg-card))',
        borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
      }}
    >
      <span aria-hidden className="text-2xl">⚡</span>
      <div className="flex-1">
        <p className="font-display text-sm uppercase tracking-[0.06em]">Install CHEQ Fest</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          Add to your home screen for instant access
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await event.prompt();
          const { outcome } = await event.userChoice;
          if (outcome === 'accepted') {
            localStorage.setItem(DISMISS_KEY, '1');
          }
          setEvent(null);
        }}
        className="rounded-xl bg-accent px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-bg active:scale-[0.97]"
      >
        Install
      </button>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setDismissed(true);
          setEvent(null);
        }}
        aria-label="Dismiss"
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-dim hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

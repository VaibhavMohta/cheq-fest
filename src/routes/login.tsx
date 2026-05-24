import { useState } from 'react';
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/shared/Button';
import { Avatar } from '@/components/shared/Avatar';
import { CheqDomainError, signInWithGoogle, signOut, useAuth } from '@/lib/auth';

export const Route = createFileRoute('/login')({
  component: LoginScreen,
});

function LoginScreen() {
  const authState = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Send the user back to wherever they came from, or Home.
      const ref = document.referrer;
      if (ref && new URL(ref).origin === window.location.origin) {
        router.history.back();
      } else {
        await navigate({ to: '/' });
      }
    } catch (err) {
      if (err instanceof CheqDomainError) {
        setError(
          err.email
            ? `${err.email} isn't a @cheq.one account. Try a different Google account.`
            : 'That Google account is not in the @cheq.one domain.',
        );
      } else if (err && typeof err === 'object' && 'code' in err) {
        const code = String((err as { code: string }).code);
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setError(null);
        } else {
          setError(`Sign-in failed (${code}).`);
        }
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  }

  if (authState.status === 'signedIn') {
    const { user } = authState;
    return (
      <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-6 px-5">
        <header className="flex items-center gap-4">
          <Avatar
            name={user.displayName}
            googlePhotoUrl={user.photoURL}
            size={72}
            surfaceColor="var(--bg)"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-2xl uppercase">
              {user.displayName ?? 'CHEQ User'}
            </p>
            <p className="truncate font-mono text-xs text-ink-dim">{user.email}</p>
          </div>
        </header>
        <p className="text-ink-dim">You're signed in.</p>
        <div className="flex flex-col gap-2">
          <Link
            to="/"
            className="rounded-2xl bg-accent px-4 py-3 text-center font-display text-base uppercase tracking-wide text-bg"
          >
            Go to Home
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-6 px-5">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          CHEQ Fest · 2026
        </p>
        <h1 className="mt-2 font-display text-5xl uppercase">Sign in</h1>
        <p className="mt-3 text-ink-dim">
          Restricted to <span className="text-accent-2">@cheq.one</span> Google accounts. Guests
          can browse without signing in.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent"
        >
          {error}
        </p>
      )}

      <Button
        onClick={() => void handleSignIn()}
        disabled={signingIn || authState.status === 'loading'}
      >
        {signingIn ? 'Opening Google…' : 'Continue with Google'}
      </Button>

      <Link to="/" className="text-center font-mono text-xs uppercase text-ink-dim">
        ← Browse as guest
      </Link>
    </main>
  );
}

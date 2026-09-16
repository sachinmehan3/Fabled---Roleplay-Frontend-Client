import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { api, SIGNED_OUT } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = 'checking' | 'setup' | 'login' | 'in';

/** Nothing of the app renders, and nothing is fetched, until you are signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('checking');

  const check = useCallback(async () => {
    try {
      const s = await api.authStatus();
      setStage(s.authenticated ? 'in' : s.configured ? 'login' : 'setup');
    } catch {
      setStage('login');
    }
  }, []);

  useEffect(() => {
    check();
    // Any request the server refuses for want of a session lands here.
    const onSignedOut = () => check();
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, [check]);

  if (stage === 'in') return <>{children}</>;
  if (stage === 'checking') {
    return (
      <div className="bg-background flex h-dvh items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  return <SignIn setup={stage === 'setup'} onDone={() => setStage('in')} />;
}

function SignIn({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (setup) await api.setupAuth(code, password);
      else await api.login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="bg-card w-full max-w-sm space-y-5 rounded-2xl border p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/fabled-icon.svg" alt="" className="size-12" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{setup ? 'Set up Fabled' : 'Welcome back'}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {setup
                ? 'Choose the password that will guard your characters and chats.'
                : 'Enter your password to continue.'}
            </p>
          </div>
        </div>

        {setup && (
          <div className="grid gap-2">
            <Label htmlFor="setup-code">Setup code</Label>
            <Input
              id="setup-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12 characters"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              Printed in the window where the server is running. It proves you are the one who started it.
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="password">{setup ? 'New password' : 'Password'}</Label>
          <div className="relative">
            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={setup ? 'new-password' : 'current-password'}
              className="pl-8"
              autoFocus={!setup}
            />
          </div>
        </div>

        {setup && (
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-muted-foreground text-xs">At least 8 characters. A phrase is easier to remember than symbols.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy || !password || (setup && !code)}>
          {busy && <LoaderCircle className="animate-spin" />}
          {setup ? 'Set password and continue' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

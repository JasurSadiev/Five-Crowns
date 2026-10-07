import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Mail, MailCheck, RefreshCw } from 'lucide-react';
import { Button, Input, Panel } from '../components/common';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  registerWithEmail,
  requestPasswordReset,
  resendVerification,
  signInWithEmail,
  signInWithGoogle,
} from '../firebase/auth';
import {
  passwordStrength,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../utils/validation';
import { errorMessage } from '../utils/errors';
import { cn } from '../utils/cn';

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}): JSX.Element {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md items-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(21,121,90,0.22),transparent_70%)]"
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full"
      >
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <Panel className="p-6">{children}</Panel>
        {footer ? <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div> : null}
      </motion.div>
    </div>
  );
}

function GoogleButton({ onDone }: { onDone: () => void }): JSX.Element {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await signInWithGoogle();
          onDone();
        } catch (error) {
          toast.error(error, 'Google sign-in failed');
        } finally {
          setLoading(false);
        }
      }}
      icon={
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M21.35 11.1h-9.17v2.96h5.27c-.23 1.37-1.6 4.02-5.27 4.02-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 3.78 14.73 2.9 12.18 2.9 7.08 2.9 2.95 7.03 2.95 12.12s4.13 9.22 9.23 9.22c5.33 0 8.86-3.74 8.86-9.01 0-.61-.07-1.07-.16-1.53z"
          />
        </svg>
      }
    >
      Continue with Google
    </Button>
  );
}

/* -------------------------------- Sign in -------------------------------- */

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/home';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) return setError(emailError);
    if (!password) return setError('Enter your password.');

    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to rejoin your table."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-gold-400 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          leading={<Mail className="h-4 w-4" />}
          placeholder="you@example.com"
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          error={error}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-ink-muted hover:text-ink">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton onDone={() => navigate(next, { replace: true })} />
    </AuthLayout>
  );
}

/* ------------------------------- Register -------------------------------- */

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const strength = passwordStrength(password);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string | null> = {
      displayName: validateUsername(displayName),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await registerWithEmail(email.trim(), password, displayName.trim());
      toast.success('Welcome to Five Crowns!', 'Check your inbox to verify your email.');
      navigate('/home', { replace: true });
    } catch (caught) {
      setErrors({ form: errorMessage(caught) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Pick a name your friends will recognise at the table."
      footer={
        <>
          Already playing?{' '}
          <Link to="/login" className="font-medium text-gold-400 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="card_shark"
          autoComplete="nickname"
          error={errors.displayName}
          hint="3–20 characters. Letters, numbers, dots, dashes and underscores."
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          leading={<Mail className="h-4 w-4" />}
          placeholder="you@example.com"
          error={errors.email}
        />
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            error={errors.password}
          />
          {password ? (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      index < strength.score
                        ? strength.score <= 1
                          ? 'bg-rose-500'
                          : strength.score === 2
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        : 'bg-ink/15',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-faint">Password strength: {strength.label}</p>
            </div>
          ) : null}
        </div>

        {errors.form ? (
          <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-400">
            {errors.form}
          </p>
        ) : null}

        <Button type="submit" fullWidth size="lg" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-xs text-ink-faint">
          No payments, no gambling — just the card game.
        </p>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton onDone={() => navigate('/home', { replace: true })} />
    </AuthLayout>
  );
}

/* ---------------------------- Password reset ----------------------------- */

export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) return setError(emailError);
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <Check className="h-6 w-6" />
          </span>
          <p className="font-medium text-ink">Check your inbox</p>
          <p className="mt-1 text-sm text-ink-muted">
            If an account exists for {email}, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            leading={<Mail className="h-4 w-4" />}
            error={error}
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------------------------- Verify email ------------------------------- */

export function VerifyEmailPage(): JSX.Element {
  const { user, emailVerified, refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title={emailVerified ? 'Email verified' : 'Verify your email'}
      subtitle={
        emailVerified
          ? 'You are all set.'
          : `We sent a link to ${user?.email ?? 'your inbox'}. Click it, then come back here.`
      }
    >
      <div className="text-center">
        <span
          className={cn(
            'mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full',
            emailVerified ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gold-400/15 text-gold-400',
          )}
        >
          <MailCheck className="h-7 w-7" />
        </span>

        {emailVerified ? (
          <Button fullWidth size="lg" onClick={() => navigate('/home')}>
            Continue to the lobby
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              fullWidth
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={loading}
              onClick={async () => {
                setLoading(true);
                await refresh();
                setLoading(false);
              }}
            >
              I've verified — refresh
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={async () => {
                try {
                  await resendVerification();
                  toast.success('Verification email sent');
                } catch (error) {
                  toast.error(error);
                }
              }}
            >
              Resend the email
            </Button>
            <p className="text-xs text-ink-faint">
              You can keep playing while unverified — some social features stay locked until you
              confirm.
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

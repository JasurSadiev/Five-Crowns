import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ScreenLoader } from './components/common';
import LandingPage from './pages/LandingPage';
import { ForgotPasswordPage, LoginPage, RegisterPage, VerifyEmailPage } from './pages/AuthPages';

/* Route-level code splitting keeps the first paint small. */
const HomePage = lazy(() => import('./pages/HomePage'));
const PlayPage = lazy(() => import('./pages/PlayPage'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const GamePage = lazy(() => import('./pages/GamePage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HowToPlayPage = lazy(() => import('./pages/HowToPlayPage'));
const TutorialPage = lazy(() => import('./pages/TutorialPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const GameSummaryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.GameSummaryPage })),
);

function ScrollToTop(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Requires a signed-in user; remembers where they were heading. */
function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <ScreenLoader label="Checking your session…" />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

/** Signed-in players skip the marketing and auth pages. */
function RedirectIfAuthed({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <ScreenLoader label="Loading…" />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

const STARTUP_ERRORS: Record<string, { title: string; body: string; hint: string }> = {
  missing: {
    title: 'This app has not been configured yet',
    body: 'The Firebase web app credentials are missing, so there is no backend to talk to.',
    hint: 'Copy .env.example to .env, fill in your VITE_FIREBASE_* values, then rebuild and redeploy.',
  },
  demo: {
    title: 'This build is using the demo configuration',
    body: 'It was built with the bundled emulator profile instead of a real Firebase project, so sign-in and games cannot work.',
    hint: 'Remove .env.local / .env.development.local from the build machine, create a .env with your real Firebase values, then run npm run build again.',
  },
  emulator: {
    title: 'This build is pointed at the local emulators',
    body: 'It was built with VITE_USE_EMULATORS=true, which only works on a developer machine running the Firebase Emulator Suite.',
    hint: 'Note that Vite loads .env.local during "vite build" and it overrides .env. Keep emulator settings in .env.development.local, then rebuild.',
  },
  unreachable: {
    title: 'Could not reach Firebase',
    body: 'The app loaded, but Firebase Authentication never responded. This is usually a network problem or a domain that has not been authorised.',
    hint: 'Check your connection, then confirm this domain is listed under Authentication → Settings → Authorised domains in the Firebase console.',
  },
  auth: {
    title: 'Sign-in service unavailable',
    body: 'Firebase Authentication reported an error while starting up.',
    hint: 'Open the browser console for the underlying error. Verify that Email/Password and Google sign-in are enabled for this project.',
  },
};

/**
 * Shows an actionable screen when the app cannot reach its backend.
 *
 * Previously every one of these cases produced an endless "Checking your
 * session…" spinner, which is indistinguishable from a hung page.
 */
function StartupGate({ children }: { children: ReactNode }): JSX.Element {
  const { startupError } = useAuth();
  if (!startupError) return <>{children}</>;

  const detail = STARTUP_ERRORS[startupError] ?? STARTUP_ERRORS.auth;
  return (
    <main className="grid min-h-screen place-items-center bg-felt-table px-6 py-16">
      <div className="panel max-w-xl space-y-4 p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-3xl">
          <span aria-hidden="true">⚠️</span>
        </div>
        <h1 className="font-display text-2xl text-ink">{detail.title}</h1>
        <p className="text-ink/70">{detail.body}</p>
        <p className="rounded-xl border border-line bg-surface/60 p-4 text-left text-sm text-ink/60">
          {detail.hint}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-gold-500 px-5 py-2.5 font-medium text-felt-950 transition hover:bg-gold-400"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

function AppRoutes(): JSX.Element {
  return (
    <AppShell>
      <Suspense fallback={<ScreenLoader label="Loading…" />}>
        <Routes>
          {/* public */}
          <Route
            path="/"
            element={
              <RedirectIfAuthed>
                <LandingPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <RegisterPage />
              </RedirectIfAuthed>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/how-to-play" element={<HowToPlayPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />

          {/* authenticated */}
          <Route
            path="/verify-email"
            element={
              <RequireAuth>
                <VerifyEmailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/home"
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/play"
            element={
              <RequireAuth>
                <PlayPage />
              </RequireAuth>
            }
          />
          <Route
            path="/lobby/:lobbyId"
            element={
              <RequireAuth>
                <LobbyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/game/:gameId"
            element={
              <RequireAuth>
                <GamePage />
              </RequireAuth>
            }
          />
          <Route
            path="/friends"
            element={
              <RequireAuth>
                <FriendsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <RequireAuth>
                <LeaderboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:uid"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <HistoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/history/:gameId"
            element={
              <RequireAuth>
                <GameSummaryPage />
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <ScrollToTop />
              <StartupGate>
                <AppRoutes />
              </StartupGate>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

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
              <AppRoutes />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

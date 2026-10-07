import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BookOpen,
  Check,
  Gamepad2,
  Home,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Trophy,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useNotifications } from '../../hooks/useNotifications';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../hooks/useToast';
import { signOut } from '../../firebase/auth';
import { api } from '../../firebase/functions';
import { Avatar, Badge, Button, EmptyState } from '../common';
import { relativeTime } from '../../utils/formatting';
import { cn } from '../../utils/cn';
import type { AppNotification } from '../../types/social';

const NAV = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/play', label: 'Play', icon: Gamepad2 },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/how-to-play', label: 'How to play', icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, profile } = useAuth();
  const { resolved, setTheme } = useTheme();
  const { online } = useOnlineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:text-felt-950"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link to={user ? '/home' : '/'} className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold-sheen text-lg text-felt-950 shadow-[0_6px_18px_-8px_rgba(233,181,52,0.9)]">
              ♛
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              Five <span className="text-gradient-gold">Crowns</span>
            </span>
          </Link>

          {user ? (
            <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-ink/10 text-ink dark:bg-white/10'
                        : 'text-ink-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            {!online ? (
              <span className="flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-400">
                <WifiOff className="h-3.5 w-3.5" /> Offline
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
              className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
            >
              {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {user ? (
              <>
                <NotificationBell />
                <ProfileMenu />
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-label="Menu"
                  aria-expanded={menuOpen}
                  className="rounded-lg p-2 text-ink-muted transition hover:bg-ink/5 lg:hidden dark:hover:bg-white/5"
                >
                  {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-xl bg-gold-sheen px-4 py-2 text-sm font-semibold text-felt-950 transition hover:brightness-105"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && user ? (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-line lg:hidden"
              aria-label="Mobile"
            >
              <div className="space-y-1 p-3">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                        isActive ? 'bg-ink/10 text-ink dark:bg-white/10' : 'text-ink-muted',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint">
        <p>
          Five Crowns · a real-time multiplayer card game ·{' '}
          <Link to="/how-to-play" className="underline-offset-2 hover:underline">
            Rules
          </Link>
        </p>
        <p className="mt-1">
          Signed in as {profile?.displayName ?? 'a guest'} · scores and turns are validated on the
          server.
        </p>
      </footer>
    </div>
  );
}

function NotificationBell(): JSX.Element {
  const { notifications, invitations, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function openNotification(item: AppNotification): void {
    void markRead(item.id);
    setOpen(false);
    if (item.link) navigate(item.link);
    else if (item.data?.gameId) navigate(`/game/${item.data.gameId}`);
    else if (item.data?.lobbyId) navigate(`/lobby/${item.data.lobbyId}`);
    else if (item.type.startsWith('friend')) navigate('/friends');
  }

  const total = unreadCount + invitations.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${total ? `, ${total} new` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
      >
        <Bell className="h-5 w-5" />
        {total > 0 ? (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-glass"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-display font-semibold text-ink">Notifications</p>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs font-medium text-gold-400 hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {invitations.length ? (
                <div className="border-b border-line bg-gold-400/[0.06] p-3">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gold-400">
                    Game invitations
                  </p>
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center gap-2 px-1 py-1.5">
                      <Avatar name={invitation.senderName} src={invitation.senderPhotoURL} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">
                          <strong>{invitation.senderName}</strong> invited you
                        </p>
                        <p className="text-xs text-ink-faint">{relativeTime(invitation.createdAt)}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            const result = await api.respondToInvitation(invitation.id, true);
                            setOpen(false);
                            if (result.lobbyId) navigate(`/lobby/${result.lobbyId}`);
                          } catch (error) {
                            toast.error(error, 'Could not join');
                          }
                        }}
                      >
                        Join
                      </Button>
                      <button
                        type="button"
                        aria-label="Decline invitation"
                        onClick={() => void api.respondToInvitation(invitation.id, false).catch(() => undefined)}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-ink/10 hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {notifications.length === 0 && invitations.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="All caught up"
                    description="Invitations, friend requests and turn reminders land here."
                  />
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-ink/5 dark:hover:bg-white/5',
                      !item.read && 'bg-sky-500/[0.06]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.read ? 'bg-transparent' : 'bg-sky-400',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{item.title}</span>
                      <span className="block text-sm text-ink-muted">{item.body}</span>
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProfileMenu(): JSX.Element {
  const { user, profile, emailVerified } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-expanded={open}
        className="rounded-full transition hover:ring-2 hover:ring-gold-400/40"
      >
        <Avatar
          name={profile?.displayName ?? user?.email ?? 'Player'}
          src={profile?.photoURL}
          size={34}
          presence={profile?.presence ?? 'online'}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-glass"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="truncate font-medium text-ink">{profile?.displayName ?? 'Player'}</p>
              <p className="truncate text-xs text-ink-faint">{user?.email}</p>
              <div className="mt-1.5">
                {emailVerified ? (
                  <Badge tone="green">
                    <Check className="h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge tone="gold">Email not verified</Badge>
                )}
              </div>
            </div>
            <div className="p-1.5">
              {[
                { to: '/profile', label: 'Profile & stats', icon: User },
                { to: '/history', label: 'Game history', icon: Trophy },
                { to: '/settings', label: 'Settings', icon: Settings },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-400 transition hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

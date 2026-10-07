import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, configProblem, db } from '../firebase/config';
import { watchAuth, type User } from '../firebase/auth';
import { watch } from '../firebase/firestore';
import { api } from '../firebase/functions';
import { startPresence } from '../firebase/presence';
import {
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_USER_SETTINGS,
  type PrivacySettings,
  type UserPrivate,
  type UserProfile,
  type UserSettings,
} from '../types/player';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  privateProfile: UserPrivate | null;
  settings: UserSettings;
  privacy: PrivacySettings;
  loading: boolean;
  /** Set when Firebase itself is unreachable or misconfigured. */
  startupError: string | null;
  /** True while the profile document is still being created/fetched. */
  profileLoading: boolean;
  emailVerified: boolean;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  updatePrivacy: (patch: Partial<PrivacySettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateProfile, setPrivateProfile] = useState<UserPrivate | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const ensuredFor = useRef<string | null>(null);

  useEffect(() => {
    // A build that cannot reach Firebase must say so rather than spin.
    if (configProblem) {
      setLoading(false);
      setStartupError(configProblem);
      return;
    }

    /*
     * Watchdog. onAuthStateChanged normally fires within a few hundred
     * milliseconds, even when signed out. If it has not fired at all we are
     * talking to something that is not Firebase (a misrouted emulator host, a
     * blocked domain, an offline device), and an endless spinner tells the
     * user nothing. Stop blocking and explain instead.
     */
    let settled = false;
    const watchdog = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setLoading(false);
      setStartupError('unreachable');
    }, 10000);

    const stop = watchAuth(
      (next) => {
        settled = true;
        window.clearTimeout(watchdog);
        setUser(next);
        setLoading(false);
        setStartupError(null);
        if (!next) {
          setProfile(null);
          setPrivateProfile(null);
          ensuredFor.current = null;
        }
      },
      (error) => {
        // Without this the promise never settles and `loading` stays true.
        settled = true;
        window.clearTimeout(watchdog);
        console.error('[auth] listener failed', error);
        setLoading(false);
        setStartupError('auth');
      },
    );

    return () => {
      window.clearTimeout(watchdog);
      stop();
    };
  }, []);

  // Profile documents + presence, scoped to the signed-in user.
  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);

    const stopProfile = watch.profile(user.uid, (next) => {
      setProfile(next);
      setProfileLoading(false);
      // Self-heal if the account predates the profile trigger.
      if (!next && ensuredFor.current !== user.uid) {
        ensuredFor.current = user.uid;
        void api.ensureProfile().catch(() => undefined);
      }
    });
    const stopPrivate = watch.privateProfile(user.uid, setPrivateProfile);
    const stopPresence = startPresence(user.uid);

    return () => {
      stopProfile();
      stopPrivate();
      stopPresence();
    };
  }, [user]);

  // Keep the verified flag in sync after the player clicks the email link.
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const timer = setInterval(() => {
      void user.reload().then(() => {
        if (auth.currentUser?.emailVerified) {
          void api.syncEmailVerified().catch(() => undefined);
          setUser({ ...auth.currentUser } as User);
        }
      });
    }, 20000);
    return () => clearInterval(timer);
  }, [user]);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!user) return;
      const next = { ...DEFAULT_USER_SETTINGS, ...(privateProfile?.settings ?? {}), ...patch };
      setPrivateProfile((current) =>
        current ? { ...current, settings: next } : current,
      );
      await setDoc(
        doc(db, 'users', user.uid, 'private', 'profile'),
        { settings: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    [user, privateProfile],
  );

  const updatePrivacy = useCallback(
    async (patch: Partial<PrivacySettings>) => {
      if (!user) return;
      const next = { ...DEFAULT_PRIVACY_SETTINGS, ...(privateProfile?.privacy ?? {}), ...patch };
      setPrivateProfile((current) => (current ? { ...current, privacy: next } : current));
      await setDoc(
        doc(db, 'users', user.uid, 'private', 'profile'),
        { privacy: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
    },
    [user, privateProfile],
  );

  const refresh = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser({ ...auth.currentUser } as User);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      privateProfile,
      settings: { ...DEFAULT_USER_SETTINGS, ...(privateProfile?.settings ?? {}) },
      privacy: { ...DEFAULT_PRIVACY_SETTINGS, ...(privateProfile?.privacy ?? {}) },
      loading,
      startupError,
      profileLoading,
      emailVerified: Boolean(user?.emailVerified),
      updateSettings,
      updatePrivacy,
      refresh,
    }),
    [
      user,
      profile,
      privateProfile,
      loading,
      startupError,
      profileLoading,
      updateSettings,
      updatePrivacy,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

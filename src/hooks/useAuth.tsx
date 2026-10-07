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
import { auth, db } from '../firebase/config';
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
  const [profileLoading, setProfileLoading] = useState(false);
  const ensuredFor = useRef<string | null>(null);

  useEffect(() => {
    return watchAuth((next) => {
      setUser(next);
      setLoading(false);
      if (!next) {
        setProfile(null);
        setPrivateProfile(null);
        ensuredFor.current = null;
      }
    });
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
      profileLoading,
      emailVerified: Boolean(user?.emailVerified),
      updateSettings,
      updatePrivacy,
      refresh,
    }),
    [user, profile, privateProfile, loading, profileLoading, updateSettings, updatePrivacy, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

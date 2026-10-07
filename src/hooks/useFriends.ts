import { useEffect, useMemo, useState } from 'react';
import { watch } from '../firebase/firestore';
import { useAuth } from './useAuth';
import type { Friendship } from '../types/social';
import type { UserProfile } from '../types/player';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface FriendRow {
  uid: string;
  displayName: string;
  photoURL: string | null;
  presence: 'online' | 'away' | 'offline';
  pairKey: string;
  status: Friendship['status'];
  incoming: boolean;
}

export function useFriends() {
  const { user } = useAuth();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return watch.friends(user.uid, (next) => {
      setFriendships(next);
      setLoading(false);
    });
  }, [user]);

  // Presence lives on the public profile, so fetch the other half once.
  useEffect(() => {
    if (!user) return;
    const others = friendships
      .flatMap((friendship) => friendship.members)
      .filter((uid) => uid !== user.uid);
    const missing = others.filter((uid) => !profiles[uid]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (uid) => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null;
      }),
    ).then((results) => {
      const next: Record<string, UserProfile> = {};
      results.forEach((profile) => {
        if (profile) next[profile.uid] = profile;
      });
      if (Object.keys(next).length) setProfiles((current) => ({ ...current, ...next }));
    });
  }, [friendships, user, profiles]);

  const rows = useMemo<FriendRow[]>(() => {
    if (!user) return [];
    return friendships.map((friendship) => {
      const other = friendship.members.find((uid) => uid !== user.uid) ?? '';
      const profile = profiles[other];
      const stored = friendship.profiles?.[other];
      return {
        uid: other,
        displayName: profile?.displayName ?? stored?.displayName ?? 'Player',
        photoURL: profile?.photoURL ?? stored?.photoURL ?? null,
        presence: (profile?.presence as FriendRow['presence']) ?? 'offline',
        pairKey: friendship.pairKey ?? friendship.id,
        status: friendship.status,
        incoming: friendship.recipientId === user.uid,
      };
    });
  }, [friendships, profiles, user]);

  return {
    loading,
    friends: rows.filter((row) => row.status === 'accepted'),
    incoming: rows.filter((row) => row.status === 'pending' && row.incoming),
    outgoing: rows.filter((row) => row.status === 'pending' && !row.incoming),
    blocked: rows.filter((row) => row.status === 'blocked'),
  };
}

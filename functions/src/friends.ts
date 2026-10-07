import { onCall } from 'firebase-functions/v2/https';
import { ENFORCE_APP_CHECK, FieldValue, col, db } from './lib/admin';
import { appError, handler } from './lib/errors';
import { pairKey, rateLimit, requireAuth, requireString } from './lib/guards';
import { notify } from './lib/notify';

interface FriendshipDoc {
  pairKey: string;
  requesterId: string;
  recipientId: string;
  members: string[];
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  blockedBy: string | null;
}

export const sendFriendRequest = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('sendFriendRequest', async (data: { targetId?: string }, uid: string) => {
      await rateLimit(uid, 'friendRequest', 30, 60 * 60 * 1000);
      const targetId = requireString(data?.targetId, 'targetId', 64);
      if (targetId === uid) throw appError('self_action', 'failed-precondition');

      const key = pairKey(uid, targetId);
      const [meSnap, targetSnap, targetPrivate] = await Promise.all([
        col.user(uid).get(),
        col.user(targetId).get(),
        col.userPrivate(targetId).get(),
      ]);
      if (!targetSnap.exists) throw appError('user_not_found', 'not-found');
      const privacy = targetPrivate.data()?.privacy as { allowFriendRequests?: boolean } | undefined;
      if (privacy && privacy.allowFriendRequests === false) {
        throw appError('friend_requests_disabled', 'permission-denied');
      }

      await db.runTransaction(async (tx) => {
        const ref = col.friendship(key);
        const snap = await tx.get(ref);
        const existing = snap.data() as FriendshipDoc | undefined;
        if (existing?.status === 'accepted') throw appError('already_friends', 'already-exists');
        if (existing?.status === 'blocked') throw appError('blocked', 'permission-denied');
        if (existing?.status === 'pending') {
          // The other player already asked: accept instead of duplicating.
          if (existing.requesterId === targetId) {
            tx.update(ref, { status: 'accepted', updatedAt: FieldValue.serverTimestamp() });
            return;
          }
          throw appError('already_invited', 'already-exists');
        }
        tx.set(ref, {
          id: key,
          pairKey: key,
          requesterId: uid,
          recipientId: targetId,
          members: [uid, targetId].sort(),
          status: 'pending',
          blockedBy: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          profiles: {
            [uid]: {
              displayName: (meSnap.data()?.displayName as string) ?? 'Player',
              photoURL: (meSnap.data()?.photoURL as string | null) ?? null,
            },
            [targetId]: {
              displayName: (targetSnap.data()?.displayName as string) ?? 'Player',
              photoURL: (targetSnap.data()?.photoURL as string | null) ?? null,
            },
          },
        });
      });

      await notify({
        uid: targetId,
        type: 'friend_request',
        title: 'New friend request',
        body: `${(meSnap.data()?.displayName as string) ?? 'A player'} wants to be friends.`,
        link: '/app/friends',
        data: { from: uid },
      });
      return { sent: true };
    })(request.data, requireAuth(request), request),
);

export const respondToFriendRequest = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'respondToFriendRequest',
      async (data: { pairKey?: string; accept?: boolean }, uid: string) => {
        const key = requireString(data?.pairKey, 'pairKey', 150);
        const accept = data?.accept === true;
        const requesterId = await db.runTransaction(async (tx) => {
          const ref = col.friendship(key);
          const snap = await tx.get(ref);
          if (!snap.exists) throw appError('user_not_found', 'not-found');
          const friendship = snap.data() as FriendshipDoc;
          if (friendship.recipientId !== uid) throw appError('blocked', 'permission-denied');
          if (friendship.status !== 'pending') {
            throw appError('invitation_handled', 'failed-precondition');
          }
          tx.update(ref, {
            status: accept ? 'accepted' : 'declined',
            updatedAt: FieldValue.serverTimestamp(),
          });
          return friendship.requesterId;
        });

        if (accept) {
          const me = await col.user(uid).get();
          await notify({
            uid: requesterId,
            type: 'friend_accepted',
            title: 'Friend request accepted',
            body: `${(me.data()?.displayName as string) ?? 'A player'} is now your friend.`,
            link: '/app/friends',
            data: { from: uid },
          });
        }
        return { accepted: accept };
      },
    )(request.data, requireAuth(request), request),
);

export const removeFriend = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('removeFriend', async (data: { targetId?: string }, uid: string) => {
      const targetId = requireString(data?.targetId, 'targetId', 64);
      const ref = col.friendship(pairKey(uid, targetId));
      const snap = await ref.get();
      if (!snap.exists) return { removed: true };
      const friendship = snap.data() as FriendshipDoc;
      if (!friendship.members.includes(uid)) throw appError('blocked', 'permission-denied');
      if (friendship.status === 'blocked' && friendship.blockedBy !== uid) {
        throw appError('blocked', 'permission-denied');
      }
      await ref.delete();
      return { removed: true };
    })(request.data, requireAuth(request), request),
);

export const blockPlayer = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('blockPlayer', async (data: { targetId?: string }, uid: string) => {
      const targetId = requireString(data?.targetId, 'targetId', 64);
      if (targetId === uid) throw appError('self_action', 'failed-precondition');
      const key = pairKey(uid, targetId);
      const [meSnap, targetSnap] = await Promise.all([col.user(uid).get(), col.user(targetId).get()]);
      if (!targetSnap.exists) throw appError('user_not_found', 'not-found');

      await col.friendship(key).set(
        {
          id: key,
          pairKey: key,
          requesterId: uid,
          recipientId: targetId,
          members: [uid, targetId].sort(),
          status: 'blocked',
          blockedBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          profiles: {
            [uid]: {
              displayName: (meSnap.data()?.displayName as string) ?? 'Player',
              photoURL: (meSnap.data()?.photoURL as string | null) ?? null,
            },
            [targetId]: {
              displayName: (targetSnap.data()?.displayName as string) ?? 'Player',
              photoURL: (targetSnap.data()?.photoURL as string | null) ?? null,
            },
          },
        },
        { merge: true },
      );
      await col.userPrivate(uid).set({ blocked: FieldValue.arrayUnion(targetId) }, { merge: true });

      // Any pending invitations between the two are cancelled.
      const pending = await col
        .invitations()
        .where('recipientId', '==', uid)
        .where('status', '==', 'pending')
        .get();
      const batch = db.batch();
      pending.docs
        .filter((doc) => doc.data().senderId === targetId)
        .forEach((doc) => batch.update(doc.ref, { status: 'cancelled' }));
      await batch.commit();

      return { blocked: true };
    })(request.data, requireAuth(request), request),
);

export const unblockPlayer = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('unblockPlayer', async (data: { targetId?: string }, uid: string) => {
      const targetId = requireString(data?.targetId, 'targetId', 64);
      const ref = col.friendship(pairKey(uid, targetId));
      const snap = await ref.get();
      if (snap.exists && (snap.data() as FriendshipDoc).blockedBy === uid) await ref.delete();
      await col.userPrivate(uid).set({ blocked: FieldValue.arrayRemove(targetId) }, { merge: true });
      return { unblocked: true };
    })(request.data, requireAuth(request), request),
);

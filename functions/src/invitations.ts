import { onCall } from 'firebase-functions/v2/https';
import { ENFORCE_APP_CHECK, FieldValue, col, db, millisFromNow } from './lib/admin';
import { appError, handler } from './lib/errors';
import { pairKey, rateLimit, requireAuth, requireString } from './lib/guards';
import { notify } from './lib/notify';
import type { LobbyPlayer } from './shared/types/game';

const INVITATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Invites a registered player to a lobby.
 *
 * Rejects: unknown users, players already in the lobby, duplicate pending
 * invitations, blocked relationships and players who disabled invitations.
 */
export const invitePlayer = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'invitePlayer',
      async (data: { lobbyId?: string; recipientId?: string }, uid: string) => {
        await rateLimit(uid, 'invite', 30, 10 * 60 * 1000);
        const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
        const recipientId = requireString(data?.recipientId, 'recipientId', 64);
        if (recipientId === uid) throw appError('self_action', 'failed-precondition');

        const [lobbySnap, recipientSnap, senderSnap, recipientPrivateSnap, relationSnap] =
          await Promise.all([
            col.lobby(lobbyId).get(),
            col.user(recipientId).get(),
            col.user(uid).get(),
            col.userPrivate(recipientId).get(),
            col.friendship(pairKey(uid, recipientId)).get(),
          ]);

        if (!lobbySnap.exists) throw appError('lobby_not_found', 'not-found');
        const lobby = lobbySnap.data() as {
          status: string;
          playerIds: string[];
          players: LobbyPlayer[];
          maxPlayers: number;
          joinCode: string;
        };
        if (!lobby.playerIds.includes(uid)) throw appError('not_in_game', 'permission-denied');
        if (lobby.status !== 'open') throw appError('lobby_closed', 'failed-precondition');
        if (!recipientSnap.exists) throw appError('user_not_found', 'not-found');
        if (lobby.playerIds.includes(recipientId)) {
          throw appError('already_in_lobby', 'failed-precondition');
        }
        if (lobby.playerIds.length >= lobby.maxPlayers) {
          throw appError('lobby_full', 'failed-precondition');
        }

        const relation = relationSnap.data() as
          | { status?: string; blockedBy?: string | null }
          | undefined;
        if (relation?.status === 'blocked') throw appError('blocked', 'permission-denied');

        const privacy = recipientPrivateSnap.data()?.privacy as
          | { allowGameInvitations?: string }
          | undefined;
        const mode = privacy?.allowGameInvitations ?? 'everyone';
        if (mode === 'nobody') throw appError('invitations_disabled', 'permission-denied');
        if (mode === 'friends' && relation?.status !== 'accepted') {
          throw appError('invitations_disabled', 'permission-denied');
        }

        const duplicate = await col
          .invitations()
          .where('recipientId', '==', recipientId)
          .where('lobbyId', '==', lobbyId)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
        if (!duplicate.empty) throw appError('already_invited', 'already-exists');

        const senderName = (senderSnap.data()?.displayName as string) ?? 'A player';
        const ref = col.invitations().doc();
        await ref.set({
          id: ref.id,
          senderId: uid,
          senderName,
          senderPhotoURL: (senderSnap.data()?.photoURL as string | null) ?? null,
          recipientId,
          lobbyId,
          joinCode: lobby.joinCode,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: millisFromNow(INVITATION_TTL_MS),
          respondedAt: null,
        });

        await notify({
          uid: recipientId,
          type: 'game_invitation',
          title: `${senderName} invited you to play`,
          body: 'Five Crowns - tap to join the table.',
          link: `/lobby/${lobbyId}`,
          data: { lobbyId, invitationId: ref.id },
        });

        return { invitationId: ref.id };
      },
    )(request.data, requireAuth(request), request),
);

export const respondToInvitation = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'respondToInvitation',
      async (data: { invitationId?: string; accept?: boolean }, uid: string) => {
        const invitationId = requireString(data?.invitationId, 'invitationId', 64);
        const accept = data?.accept === true;

        const result = await db.runTransaction(async (tx) => {
          const inviteRef = col.invitation(invitationId);
          const inviteSnap = await tx.get(inviteRef);
          if (!inviteSnap.exists) throw appError('invitation_expired', 'not-found');
          const invite = inviteSnap.data() as {
            recipientId: string;
            senderId: string;
            lobbyId: string;
            status: string;
            expiresAt?: FirebaseFirestore.Timestamp;
          };
          if (invite.recipientId !== uid) throw appError('blocked', 'permission-denied');
          if (invite.status !== 'pending') throw appError('invitation_handled', 'failed-precondition');
          if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
            tx.update(inviteRef, { status: 'expired' });
            throw appError('invitation_expired', 'failed-precondition');
          }

          if (!accept) {
            tx.update(inviteRef, {
              status: 'declined',
              respondedAt: FieldValue.serverTimestamp(),
            });
            return { lobbyId: null as string | null, senderId: invite.senderId };
          }

          const lobbyRef = col.lobby(invite.lobbyId);
          const lobbySnap = await tx.get(lobbyRef);
          if (!lobbySnap.exists) throw appError('lobby_not_found', 'not-found');
          const lobby = lobbySnap.data() as {
            status: string;
            playerIds: string[];
            players: LobbyPlayer[];
            maxPlayers: number;
          };
          if (lobby.status !== 'open') throw appError('lobby_closed', 'failed-precondition');
          if (!lobby.playerIds.includes(uid)) {
            if (lobby.playerIds.length >= lobby.maxPlayers) {
              throw appError('lobby_full', 'failed-precondition');
            }
            const userSnap = await tx.get(col.user(uid));
            const usedSeats = new Set(lobby.players.map((player) => player.seat));
            let seat = 0;
            while (usedSeats.has(seat)) seat += 1;
            tx.update(lobbyRef, {
              playerIds: FieldValue.arrayUnion(uid),
              players: [
                ...lobby.players,
                {
                  uid,
                  displayName: (userSnap.data()?.displayName as string) ?? 'Player',
                  photoURL: (userSnap.data()?.photoURL as string | null) ?? null,
                  seat,
                  isHost: false,
                  joinedAt: new Date(),
                  ready: true,
                },
              ],
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          tx.update(inviteRef, {
            status: 'accepted',
            respondedAt: FieldValue.serverTimestamp(),
          });
          return { lobbyId: invite.lobbyId, senderId: invite.senderId };
        });

        return { lobbyId: result.lobbyId };
      },
    )(request.data, requireAuth(request), request),
);

export const cancelInvitation = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('cancelInvitation', async (data: { invitationId?: string }, uid: string) => {
      const invitationId = requireString(data?.invitationId, 'invitationId', 64);
      const ref = col.invitation(invitationId);
      const snap = await ref.get();
      if (!snap.exists) return { cancelled: true };
      if (snap.data()?.senderId !== uid) throw appError('blocked', 'permission-denied');
      await ref.update({ status: 'cancelled', respondedAt: FieldValue.serverTimestamp() });
      return { cancelled: true };
    })(request.data, requireAuth(request), request),
);

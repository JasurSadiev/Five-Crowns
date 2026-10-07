"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelInvitation = exports.respondToInvitation = exports.invitePlayer = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
const notify_1 = require("./lib/notify");
const INVITATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
/**
 * Invites a registered player to a lobby.
 *
 * Rejects: unknown users, players already in the lobby, duplicate pending
 * invitations, blocked relationships and players who disabled invitations.
 */
exports.invitePlayer = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('invitePlayer', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'invite', 30, 10 * 60 * 1000);
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    const recipientId = (0, guards_1.requireString)(data?.recipientId, 'recipientId', 64);
    if (recipientId === uid)
        throw (0, errors_1.appError)('self_action', 'failed-precondition');
    const [lobbySnap, recipientSnap, senderSnap, recipientPrivateSnap, relationSnap] = await Promise.all([
        admin_1.col.lobby(lobbyId).get(),
        admin_1.col.user(recipientId).get(),
        admin_1.col.user(uid).get(),
        admin_1.col.userPrivate(recipientId).get(),
        admin_1.col.friendship((0, guards_1.pairKey)(uid, recipientId)).get(),
    ]);
    if (!lobbySnap.exists)
        throw (0, errors_1.appError)('lobby_not_found', 'not-found');
    const lobby = lobbySnap.data();
    if (!lobby.playerIds.includes(uid))
        throw (0, errors_1.appError)('not_in_game', 'permission-denied');
    if (lobby.status !== 'open')
        throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
    if (!recipientSnap.exists)
        throw (0, errors_1.appError)('user_not_found', 'not-found');
    if (lobby.playerIds.includes(recipientId)) {
        throw (0, errors_1.appError)('already_in_lobby', 'failed-precondition');
    }
    if (lobby.playerIds.length >= lobby.maxPlayers) {
        throw (0, errors_1.appError)('lobby_full', 'failed-precondition');
    }
    const relation = relationSnap.data();
    if (relation?.status === 'blocked')
        throw (0, errors_1.appError)('blocked', 'permission-denied');
    const privacy = recipientPrivateSnap.data()?.privacy;
    const mode = privacy?.allowGameInvitations ?? 'everyone';
    if (mode === 'nobody')
        throw (0, errors_1.appError)('invitations_disabled', 'permission-denied');
    if (mode === 'friends' && relation?.status !== 'accepted') {
        throw (0, errors_1.appError)('invitations_disabled', 'permission-denied');
    }
    const duplicate = await admin_1.col
        .invitations()
        .where('recipientId', '==', recipientId)
        .where('lobbyId', '==', lobbyId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    if (!duplicate.empty)
        throw (0, errors_1.appError)('already_invited', 'already-exists');
    const senderName = senderSnap.data()?.displayName ?? 'A player';
    const ref = admin_1.col.invitations().doc();
    await ref.set({
        id: ref.id,
        senderId: uid,
        senderName,
        senderPhotoURL: senderSnap.data()?.photoURL ?? null,
        recipientId,
        lobbyId,
        joinCode: lobby.joinCode,
        status: 'pending',
        createdAt: admin_1.FieldValue.serverTimestamp(),
        expiresAt: (0, admin_1.millisFromNow)(INVITATION_TTL_MS),
        respondedAt: null,
    });
    await (0, notify_1.notify)({
        uid: recipientId,
        type: 'game_invitation',
        title: `${senderName} invited you to play`,
        body: 'Five Crowns - tap to join the table.',
        link: `/lobby/${lobbyId}`,
        data: { lobbyId, invitationId: ref.id },
    });
    return { invitationId: ref.id };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.respondToInvitation = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('respondToInvitation', async (data, uid) => {
    const invitationId = (0, guards_1.requireString)(data?.invitationId, 'invitationId', 64);
    const accept = data?.accept === true;
    const result = await admin_1.db.runTransaction(async (tx) => {
        const inviteRef = admin_1.col.invitation(invitationId);
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists)
            throw (0, errors_1.appError)('invitation_expired', 'not-found');
        const invite = inviteSnap.data();
        if (invite.recipientId !== uid)
            throw (0, errors_1.appError)('blocked', 'permission-denied');
        if (invite.status !== 'pending')
            throw (0, errors_1.appError)('invitation_handled', 'failed-precondition');
        if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
            tx.update(inviteRef, { status: 'expired' });
            throw (0, errors_1.appError)('invitation_expired', 'failed-precondition');
        }
        if (!accept) {
            tx.update(inviteRef, {
                status: 'declined',
                respondedAt: admin_1.FieldValue.serverTimestamp(),
            });
            return { lobbyId: null, senderId: invite.senderId };
        }
        const lobbyRef = admin_1.col.lobby(invite.lobbyId);
        const lobbySnap = await tx.get(lobbyRef);
        if (!lobbySnap.exists)
            throw (0, errors_1.appError)('lobby_not_found', 'not-found');
        const lobby = lobbySnap.data();
        if (lobby.status !== 'open')
            throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
        if (!lobby.playerIds.includes(uid)) {
            if (lobby.playerIds.length >= lobby.maxPlayers) {
                throw (0, errors_1.appError)('lobby_full', 'failed-precondition');
            }
            const userSnap = await tx.get(admin_1.col.user(uid));
            const usedSeats = new Set(lobby.players.map((player) => player.seat));
            let seat = 0;
            while (usedSeats.has(seat))
                seat += 1;
            tx.update(lobbyRef, {
                playerIds: admin_1.FieldValue.arrayUnion(uid),
                players: [
                    ...lobby.players,
                    {
                        uid,
                        displayName: userSnap.data()?.displayName ?? 'Player',
                        photoURL: userSnap.data()?.photoURL ?? null,
                        seat,
                        isHost: false,
                        joinedAt: new Date(),
                        ready: true,
                    },
                ],
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
        }
        tx.update(inviteRef, {
            status: 'accepted',
            respondedAt: admin_1.FieldValue.serverTimestamp(),
        });
        return { lobbyId: invite.lobbyId, senderId: invite.senderId };
    });
    return { lobbyId: result.lobbyId };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.cancelInvitation = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('cancelInvitation', async (data, uid) => {
    const invitationId = (0, guards_1.requireString)(data?.invitationId, 'invitationId', 64);
    const ref = admin_1.col.invitation(invitationId);
    const snap = await ref.get();
    if (!snap.exists)
        return { cancelled: true };
    if (snap.data()?.senderId !== uid)
        throw (0, errors_1.appError)('blocked', 'permission-denied');
    await ref.update({ status: 'cancelled', respondedAt: admin_1.FieldValue.serverTimestamp() });
    return { cancelled: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=invitations.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unblockPlayer = exports.blockPlayer = exports.removeFriend = exports.respondToFriendRequest = exports.sendFriendRequest = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
const notify_1 = require("./lib/notify");
exports.sendFriendRequest = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('sendFriendRequest', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'friendRequest', 30, 60 * 60 * 1000);
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 64);
    if (targetId === uid)
        throw (0, errors_1.appError)('self_action', 'failed-precondition');
    const key = (0, guards_1.pairKey)(uid, targetId);
    const [meSnap, targetSnap, targetPrivate] = await Promise.all([
        admin_1.col.user(uid).get(),
        admin_1.col.user(targetId).get(),
        admin_1.col.userPrivate(targetId).get(),
    ]);
    if (!targetSnap.exists)
        throw (0, errors_1.appError)('user_not_found', 'not-found');
    const privacy = targetPrivate.data()?.privacy;
    if (privacy && privacy.allowFriendRequests === false) {
        throw (0, errors_1.appError)('friend_requests_disabled', 'permission-denied');
    }
    await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.friendship(key);
        const snap = await tx.get(ref);
        const existing = snap.data();
        if (existing?.status === 'accepted')
            throw (0, errors_1.appError)('already_friends', 'already-exists');
        if (existing?.status === 'blocked')
            throw (0, errors_1.appError)('blocked', 'permission-denied');
        if (existing?.status === 'pending') {
            // The other player already asked: accept instead of duplicating.
            if (existing.requesterId === targetId) {
                tx.update(ref, { status: 'accepted', updatedAt: admin_1.FieldValue.serverTimestamp() });
                return;
            }
            throw (0, errors_1.appError)('already_invited', 'already-exists');
        }
        tx.set(ref, {
            id: key,
            pairKey: key,
            requesterId: uid,
            recipientId: targetId,
            members: [uid, targetId].sort(),
            status: 'pending',
            blockedBy: null,
            createdAt: admin_1.FieldValue.serverTimestamp(),
            updatedAt: admin_1.FieldValue.serverTimestamp(),
            profiles: {
                [uid]: {
                    displayName: meSnap.data()?.displayName ?? 'Player',
                    photoURL: meSnap.data()?.photoURL ?? null,
                },
                [targetId]: {
                    displayName: targetSnap.data()?.displayName ?? 'Player',
                    photoURL: targetSnap.data()?.photoURL ?? null,
                },
            },
        });
    });
    await (0, notify_1.notify)({
        uid: targetId,
        type: 'friend_request',
        title: 'New friend request',
        body: `${meSnap.data()?.displayName ?? 'A player'} wants to be friends.`,
        link: '/app/friends',
        data: { from: uid },
    });
    return { sent: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.respondToFriendRequest = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('respondToFriendRequest', async (data, uid) => {
    const key = (0, guards_1.requireString)(data?.pairKey, 'pairKey', 150);
    const accept = data?.accept === true;
    const requesterId = await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.friendship(key);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw (0, errors_1.appError)('user_not_found', 'not-found');
        const friendship = snap.data();
        if (friendship.recipientId !== uid)
            throw (0, errors_1.appError)('blocked', 'permission-denied');
        if (friendship.status !== 'pending') {
            throw (0, errors_1.appError)('invitation_handled', 'failed-precondition');
        }
        tx.update(ref, {
            status: accept ? 'accepted' : 'declined',
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
        return friendship.requesterId;
    });
    if (accept) {
        const me = await admin_1.col.user(uid).get();
        await (0, notify_1.notify)({
            uid: requesterId,
            type: 'friend_accepted',
            title: 'Friend request accepted',
            body: `${me.data()?.displayName ?? 'A player'} is now your friend.`,
            link: '/app/friends',
            data: { from: uid },
        });
    }
    return { accepted: accept };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.removeFriend = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('removeFriend', async (data, uid) => {
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 64);
    const ref = admin_1.col.friendship((0, guards_1.pairKey)(uid, targetId));
    const snap = await ref.get();
    if (!snap.exists)
        return { removed: true };
    const friendship = snap.data();
    if (!friendship.members.includes(uid))
        throw (0, errors_1.appError)('blocked', 'permission-denied');
    if (friendship.status === 'blocked' && friendship.blockedBy !== uid) {
        throw (0, errors_1.appError)('blocked', 'permission-denied');
    }
    await ref.delete();
    return { removed: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.blockPlayer = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('blockPlayer', async (data, uid) => {
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 64);
    if (targetId === uid)
        throw (0, errors_1.appError)('self_action', 'failed-precondition');
    const key = (0, guards_1.pairKey)(uid, targetId);
    const [meSnap, targetSnap] = await Promise.all([admin_1.col.user(uid).get(), admin_1.col.user(targetId).get()]);
    if (!targetSnap.exists)
        throw (0, errors_1.appError)('user_not_found', 'not-found');
    await admin_1.col.friendship(key).set({
        id: key,
        pairKey: key,
        requesterId: uid,
        recipientId: targetId,
        members: [uid, targetId].sort(),
        status: 'blocked',
        blockedBy: uid,
        updatedAt: admin_1.FieldValue.serverTimestamp(),
        createdAt: admin_1.FieldValue.serverTimestamp(),
        profiles: {
            [uid]: {
                displayName: meSnap.data()?.displayName ?? 'Player',
                photoURL: meSnap.data()?.photoURL ?? null,
            },
            [targetId]: {
                displayName: targetSnap.data()?.displayName ?? 'Player',
                photoURL: targetSnap.data()?.photoURL ?? null,
            },
        },
    }, { merge: true });
    await admin_1.col.userPrivate(uid).set({ blocked: admin_1.FieldValue.arrayUnion(targetId) }, { merge: true });
    // Any pending invitations between the two are cancelled.
    const pending = await admin_1.col
        .invitations()
        .where('recipientId', '==', uid)
        .where('status', '==', 'pending')
        .get();
    const batch = admin_1.db.batch();
    pending.docs
        .filter((doc) => doc.data().senderId === targetId)
        .forEach((doc) => batch.update(doc.ref, { status: 'cancelled' }));
    await batch.commit();
    return { blocked: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.unblockPlayer = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('unblockPlayer', async (data, uid) => {
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 64);
    const ref = admin_1.col.friendship((0, guards_1.pairKey)(uid, targetId));
    const snap = await ref.get();
    if (snap.exists && snap.data().blockedBy === uid)
        await ref.delete();
    await admin_1.col.userPrivate(uid).set({ blocked: admin_1.FieldValue.arrayRemove(targetId) }, { merge: true });
    return { unblocked: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=friends.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPublicLobbies = exports.cancelLobby = exports.updateLobbySettings = exports.kickPlayer = exports.leaveLobby = exports.joinLobbyByCode = exports.joinLobby = exports.createLobby = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
const codes_1 = require("./lib/codes");
const notify_1 = require("./lib/notify");
const game_1 = require("./shared/types/game");
const LOBBY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
/**
 * Only cosmetic / fairness-neutral options are configurable. Nothing here can
 * give a player an advantage: the card ladder, wild ranks, scoring and turn
 * order are fixed by the rules engine.
 */
function sanitiseSettings(input, maxPlayers) {
    const source = input ?? {};
    const privacy = source.privacy === 'public' ? 'public' : 'private';
    const roundAdvance = source.roundAdvance === 'auto' ? 'auto' : 'host';
    const tieBreak = source.tieBreak === 'tie_break_round' ? 'tie_break_round' : 'shared_win';
    return {
        ...game_1.DEFAULT_GAME_SETTINGS,
        privacy,
        maxPlayers,
        allowSpectators: (0, guards_1.requireBoolean)(source.allowSpectators, game_1.DEFAULT_GAME_SETTINGS.allowSpectators),
        showAvatars: (0, guards_1.requireBoolean)(source.showAvatars, game_1.DEFAULT_GAME_SETTINGS.showAvatars),
        enableSound: (0, guards_1.requireBoolean)(source.enableSound, game_1.DEFAULT_GAME_SETTINGS.enableSound),
        enableAnimations: (0, guards_1.requireBoolean)(source.enableAnimations, game_1.DEFAULT_GAME_SETTINGS.enableAnimations),
        enableChat: (0, guards_1.requireBoolean)(source.enableChat, game_1.DEFAULT_GAME_SETTINGS.enableChat),
        turnTimeoutSeconds: clampTimeout(source.turnTimeoutSeconds),
        roundAdvance,
        autoAdvanceSeconds: Math.min(60, Math.max(5, Number(source.autoAdvanceSeconds) || 20)),
        tieBreak,
    };
}
function clampTimeout(value) {
    const num = Number(value);
    if (!Number.isFinite(num))
        return game_1.DEFAULT_GAME_SETTINGS.turnTimeoutSeconds;
    return Math.min(600, Math.max(30, Math.round(num)));
}
async function profileFor(uid) {
    const snap = await admin_1.col.user(uid).get();
    if (!snap.exists)
        throw (0, errors_1.appError)('user_not_found', 'not-found');
    return {
        displayName: snap.data()?.displayName ?? 'Player',
        photoURL: snap.data()?.photoURL ?? null,
    };
}
exports.createLobby = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('createLobby', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'createLobby', 12, 10 * 60 * 1000);
    const maxPlayers = (0, guards_1.requireNumber)(data?.maxPlayers ?? game_1.MAX_PLAYERS, 'maxPlayers', game_1.MIN_PLAYERS, game_1.MAX_PLAYERS);
    const settings = sanitiseSettings(data?.settings, maxPlayers);
    const profile = await profileFor(uid);
    // A player may only host one open lobby at a time.
    const existing = await admin_1.col
        .lobbies()
        .where('hostId', '==', uid)
        .where('status', '==', 'open')
        .get();
    await Promise.all(existing.docs.map(async (doc) => {
        await (0, codes_1.releaseJoinCode)(doc.data().joinCode);
        await doc.ref.update({ status: 'cancelled', updatedAt: admin_1.FieldValue.serverTimestamp() });
    }));
    const lobbyRef = admin_1.col.lobbies().doc();
    const joinCode = await (0, codes_1.reserveJoinCode)(lobbyRef.id);
    const host = {
        uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        seat: 0,
        isHost: true,
        joinedAt: admin_1.Timestamp.now(),
        ready: true,
    };
    await lobbyRef.set({
        id: lobbyRef.id,
        joinCode,
        hostId: uid,
        hostName: profile.displayName,
        status: 'open',
        gameType: 'classic',
        createdAt: admin_1.FieldValue.serverTimestamp(),
        updatedAt: admin_1.FieldValue.serverTimestamp(),
        expiresAt: (0, admin_1.millisFromNow)(LOBBY_TTL_MS),
        maxPlayers,
        playerIds: [uid],
        players: [host],
        settings,
        gameId: null,
    });
    return { lobbyId: lobbyRef.id, joinCode };
})(request.data, (0, guards_1.requireAuth)(request), request));
async function joinLobbyById(lobbyId, uid) {
    const profile = await profileFor(uid);
    await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.lobby(lobbyId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw (0, errors_1.appError)('lobby_not_found', 'not-found');
        const lobby = snap.data();
        if (lobby.status !== 'open')
            throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
        if (lobby.playerIds.includes(uid))
            return; // idempotent re-join
        if (lobby.playerIds.length >= lobby.maxPlayers)
            throw (0, errors_1.appError)('lobby_full', 'failed-precondition');
        const usedSeats = new Set(lobby.players.map((player) => player.seat));
        let seat = 0;
        while (usedSeats.has(seat))
            seat += 1;
        const player = {
            uid,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
            seat,
            isHost: false,
            joinedAt: admin_1.Timestamp.now(),
            ready: true,
        };
        tx.update(ref, {
            playerIds: admin_1.FieldValue.arrayUnion(uid),
            players: [...lobby.players, player],
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
    });
    return { lobbyId };
}
exports.joinLobby = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('joinLobby', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    return joinLobbyById(lobbyId, uid);
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.joinLobbyByCode = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('joinLobbyByCode', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'joinByCode', 30, 10 * 60 * 1000);
    const code = (0, codes_1.normaliseCode)((0, guards_1.requireString)(data?.code, 'code', 12));
    const lobbyId = await (0, codes_1.lobbyIdForCode)(code);
    if (!lobbyId)
        throw (0, errors_1.appError)('lobby_not_found', 'not-found');
    return joinLobbyById(lobbyId, uid);
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.leaveLobby = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('leaveLobby', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    let codeToRelease = null;
    await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.lobby(lobbyId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            return;
        const lobby = snap.data();
        if (!lobby.playerIds.includes(uid))
            return;
        const remaining = lobby.players.filter((player) => player.uid !== uid);
        if (lobby.hostId === uid || remaining.length === 0) {
            codeToRelease = lobby.joinCode;
            tx.update(ref, {
                status: 'cancelled',
                playerIds: [],
                players: [],
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
            return;
        }
        tx.update(ref, {
            playerIds: admin_1.FieldValue.arrayRemove(uid),
            players: remaining,
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
    });
    await (0, codes_1.releaseJoinCode)(codeToRelease);
    return { left: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.kickPlayer = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('kickPlayer', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 64);
    if (targetId === uid)
        throw (0, errors_1.appError)('self_action', 'failed-precondition');
    await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.lobby(lobbyId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw (0, errors_1.appError)('lobby_not_found', 'not-found');
        const lobby = snap.data();
        if (lobby.hostId !== uid)
            throw (0, errors_1.appError)('not_host', 'permission-denied');
        if (lobby.status !== 'open')
            throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
        tx.update(ref, {
            playerIds: admin_1.FieldValue.arrayRemove(targetId),
            players: lobby.players.filter((player) => player.uid !== targetId),
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
    });
    return { removed: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.updateLobbySettings = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('updateLobbySettings', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.col.lobby(lobbyId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw (0, errors_1.appError)('lobby_not_found', 'not-found');
        const lobby = snap.data();
        if (lobby.hostId !== uid)
            throw (0, errors_1.appError)('not_host', 'permission-denied');
        if (lobby.status !== 'open')
            throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
        const maxPlayers = (0, guards_1.requireNumber)(data?.maxPlayers ?? lobby.maxPlayers, 'maxPlayers', game_1.MIN_PLAYERS, game_1.MAX_PLAYERS);
        if (maxPlayers < lobby.playerIds.length) {
            throw (0, errors_1.appError)('too_many_players', 'failed-precondition');
        }
        tx.update(ref, {
            maxPlayers,
            settings: sanitiseSettings({ ...lobby.settings, ...data?.settings }, maxPlayers),
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
    });
    return { updated: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.cancelLobby = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('cancelLobby', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    const snap = await admin_1.col.lobby(lobbyId).get();
    if (!snap.exists)
        return { cancelled: true };
    if (snap.data()?.hostId !== uid)
        throw (0, errors_1.appError)('not_host', 'permission-denied');
    const members = snap.data()?.playerIds ?? [];
    await admin_1.col.lobby(lobbyId).update({
        status: 'cancelled',
        updatedAt: admin_1.FieldValue.serverTimestamp(),
    });
    await (0, codes_1.releaseJoinCode)(snap.data()?.joinCode);
    const pending = await admin_1.col
        .invitations()
        .where('lobbyId', '==', lobbyId)
        .where('status', '==', 'pending')
        .get();
    const batch = admin_1.db.batch();
    pending.forEach((doc) => batch.update(doc.ref, { status: 'cancelled' }));
    await batch.commit();
    await (0, notify_1.notifyMany)(members
        .filter((member) => member !== uid)
        .map((member) => ({
        uid: member,
        type: 'system',
        title: 'Lobby closed',
        body: 'The host cancelled the lobby.',
        link: '/app',
    })));
    return { cancelled: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Public lobby browser. Returns open, non-full public lobbies. */
exports.listPublicLobbies = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('listPublicLobbies', async () => {
    const snap = await admin_1.col
        .lobbies()
        .where('settings.privacy', '==', 'public')
        .where('status', '==', 'open')
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get();
    const lobbies = snap.docs
        .map((doc) => doc.data())
        .filter((lobby) => lobby.playerIds.length < lobby.maxPlayers)
        .map((lobby) => ({
        id: lobby.id,
        hostName: lobby.hostName,
        joinCode: lobby.joinCode,
        players: lobby.playerIds.length,
        maxPlayers: lobby.maxPlayers,
        allowSpectators: Boolean(lobby.settings?.allowSpectators),
    }));
    return { lobbies };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=lobbies.js.map
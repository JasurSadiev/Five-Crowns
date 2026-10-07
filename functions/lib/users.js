"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pairKey = exports.submitReport = exports.searchPlayers = exports.deleteAccount = exports.syncEmailVerified = exports.updateAvatar = exports.updateUsername = exports.ensureProfile = exports.onUserCreated = void 0;
const https_1 = require("firebase-functions/v2/https");
const functionsV1 = __importStar(require("firebase-functions/v1"));
const logger = __importStar(require("firebase-functions/logger"));
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
Object.defineProperty(exports, "pairKey", { enumerable: true, get: function () { return guards_1.pairKey; } });
const player_1 = require("./shared/types/player");
const BASE_STATS = {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    totalScore: 0,
    bestScore: null,
    worstScore: null,
    averageScore: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    totalRoundScore: 0,
    currentStreak: 0,
    bestStreak: 0,
};
function suggestName(email, displayName) {
    const base = (displayName || email?.split('@')[0] || 'Player')
        .replace(/[^A-Za-z0-9_.-]/g, '')
        .slice(0, 16);
    const safe = base.length >= 3 ? base : `Player${Math.floor(Math.random() * 9000) + 1000}`;
    return safe;
}
/** Picks a unique display name, appending digits when needed. */
async function allocateUsername(uid, preferred) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
        const candidate = attempt === 0 ? preferred : `${preferred.slice(0, 15)}${Math.floor(Math.random() * 9999)}`;
        const lower = candidate.toLowerCase();
        const taken = await admin_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(admin_1.col.username(lower));
            if (snap.exists)
                return true;
            tx.set(admin_1.col.username(lower), { uid, createdAt: admin_1.FieldValue.serverTimestamp() });
            return false;
        });
        if (!taken)
            return candidate;
    }
    return `Player${Date.now().toString().slice(-6)}`;
}
/**
 * Creates both profile documents. Statistics start at zero and can only ever
 * be changed by trusted server code.
 */
async function createProfileDocuments(input) {
    const displayName = await allocateUsername(input.uid, suggestName(input.email ?? undefined, input.displayName ?? undefined));
    const batch = admin_1.db.batch();
    batch.set(admin_1.col.user(input.uid), {
        uid: input.uid,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL: input.photoURL,
        createdAt: admin_1.FieldValue.serverTimestamp(),
        lastSeenAt: admin_1.FieldValue.serverTimestamp(),
        isOnline: true,
        presence: 'online',
        ...BASE_STATS,
    }, { merge: true });
    batch.set(admin_1.col.userPrivate(input.uid), {
        uid: input.uid,
        email: input.email,
        emailVerified: input.emailVerified,
        settings: player_1.DEFAULT_USER_SETTINGS,
        privacy: player_1.DEFAULT_PRIVACY_SETTINGS,
        blocked: [],
        updatedAt: admin_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return displayName;
}
/**
 * Auth trigger (v1 API - works with plain Firebase Auth, no Identity Platform
 * upgrade required). The client additionally calls `ensureProfile` after
 * sign-up so the first render never races the trigger.
 */
exports.onUserCreated = functionsV1
    .region(admin_1.REGION)
    .auth.user()
    .onCreate(async (user) => {
    try {
        const existing = await admin_1.col.user(user.uid).get();
        if (existing.exists)
            return;
        await createProfileDocuments({
            uid: user.uid,
            email: user.email ?? null,
            displayName: user.displayName ?? null,
            photoURL: user.photoURL ?? null,
            emailVerified: user.emailVerified ?? false,
        });
    }
    catch (error) {
        logger.error('onUserCreated failed', { uid: user.uid, error });
    }
});
/** Self-heal: creates missing profile documents for an existing account. */
exports.ensureProfile = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('ensureProfile', async (_data, uid) => {
    const snap = await admin_1.col.user(uid).get();
    const record = await admin_1.auth.getUser(uid).catch(() => null);
    if (snap.exists) {
        const priv = await admin_1.col.userPrivate(uid).get();
        if (!priv.exists) {
            await admin_1.col.userPrivate(uid).set({
                uid,
                email: record?.email ?? null,
                emailVerified: record?.emailVerified ?? false,
                settings: player_1.DEFAULT_USER_SETTINGS,
                privacy: player_1.DEFAULT_PRIVACY_SETTINGS,
                blocked: [],
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
        }
        else if (record && priv.data()?.emailVerified !== record.emailVerified) {
            await admin_1.col.userPrivate(uid).update({ emailVerified: record.emailVerified });
        }
        return { created: false, displayName: snap.data()?.displayName };
    }
    const displayName = await createProfileDocuments({
        uid,
        email: record?.email ?? null,
        displayName: record?.displayName ?? null,
        photoURL: record?.photoURL ?? null,
        emailVerified: record?.emailVerified ?? false,
    });
    return { created: true, displayName };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Changes the (globally unique) username. */
exports.updateUsername = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('updateUsername', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'username', 5, 60 * 60 * 1000);
    const requested = (0, guards_1.validateUsername)((0, guards_1.requireString)(data?.displayName, 'displayName', 20));
    const lower = requested.toLowerCase();
    await admin_1.db.runTransaction(async (tx) => {
        const [nameSnap, userSnap] = await tx.getAll(admin_1.col.username(lower), admin_1.col.user(uid));
        if (!userSnap.exists)
            throw (0, errors_1.appError)('user_not_found', 'not-found');
        const current = userSnap.data()?.displayName;
        if (current?.toLowerCase() === lower) {
            tx.update(admin_1.col.user(uid), { displayName: requested, displayNameLower: lower });
            return;
        }
        if (nameSnap.exists)
            throw (0, errors_1.appError)('username_taken', 'already-exists');
        tx.set(admin_1.col.username(lower), { uid, createdAt: admin_1.FieldValue.serverTimestamp() });
        if (current)
            tx.delete(admin_1.col.username(current.toLowerCase()));
        tx.update(admin_1.col.user(uid), { displayName: requested, displayNameLower: lower });
    });
    await admin_1.auth.updateUser(uid, { displayName: requested }).catch(() => undefined);
    return { displayName: requested };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Updates the avatar URL (uploaded to Storage by the client, or a Google photo). */
exports.updateAvatar = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('updateAvatar', async (data, uid) => {
    const photoURL = data?.photoURL ? (0, guards_1.requireString)(data.photoURL, 'photoURL', 2000) : null;
    if (photoURL && !/^https:\/\//.test(photoURL)) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', 'Avatar must be an https URL.');
    }
    await admin_1.col.user(uid).update({ photoURL });
    await admin_1.auth.updateUser(uid, { photoURL: photoURL ?? undefined }).catch(() => undefined);
    return { photoURL };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Mirrors the verified flag from the Auth record into the private profile. */
exports.syncEmailVerified = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('syncEmailVerified', async (_data, uid) => {
    const record = await admin_1.auth.getUser(uid);
    await admin_1.col.userPrivate(uid).set({
        emailVerified: record.emailVerified,
        email: record.email ?? null,
        updatedAt: admin_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { emailVerified: record.emailVerified };
})(request.data, (0, guards_1.requireAuth)(request), request));
/**
 * Permanently deletes an account: profile, username reservation, friendships,
 * invitations and the Auth user itself. Game history is kept (other players
 * need their results) but the name is anonymised.
 */
exports.deleteAccount = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('deleteAccount', async (_data, uid) => {
    const userSnap = await admin_1.col.user(uid).get();
    const displayName = userSnap.data()?.displayName ?? null;
    const activeGames = await admin_1.col
        .games()
        .where('playerIds', 'array-contains', uid)
        .where('status', 'in', ['waiting', 'starting', 'playing', 'round_complete'])
        .get();
    if (!activeGames.empty) {
        throw (0, errors_1.appError)('game_in_progress', 'failed-precondition', 'Finish or leave your active games before deleting your account.');
    }
    const batch = admin_1.db.batch();
    if (displayName)
        batch.delete(admin_1.col.username(displayName.toLowerCase()));
    batch.delete(admin_1.col.userPrivate(uid));
    batch.delete(admin_1.col.user(uid));
    const friendships = await admin_1.col.friends().where('members', 'array-contains', uid).get();
    friendships.forEach((doc) => batch.delete(doc.ref));
    const sent = await admin_1.col.invitations().where('senderId', '==', uid).get();
    sent.forEach((doc) => batch.delete(doc.ref));
    const received = await admin_1.col.invitations().where('recipientId', '==', uid).get();
    received.forEach((doc) => batch.delete(doc.ref));
    const notifications = await admin_1.col.notifications().where('uid', '==', uid).limit(400).get();
    notifications.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    await admin_1.auth.deleteUser(uid);
    return { deleted: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Name search used by the friends page. Prefix search on the lower-cased name. */
exports.searchPlayers = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('searchPlayers', async (data, uid) => {
    const raw = (0, guards_1.requireString)(data?.query, 'query', 30).toLowerCase();
    if (raw.length < 2)
        return { players: [] };
    const snap = await admin_1.col
        .users()
        .orderBy('displayNameLower')
        .startAt(raw)
        .endAt(`${raw}\uf8ff`)
        .limit(12)
        .get();
    const privateSnap = await admin_1.col.userPrivate(uid).get();
    const blocked = new Set(privateSnap.data()?.blocked ?? []);
    const players = snap.docs
        .map((doc) => doc.data())
        .filter((player) => player.uid !== uid && !blocked.has(player.uid))
        .map((player) => ({
        uid: player.uid,
        displayName: player.displayName,
        photoURL: player.photoURL ?? null,
        presence: player.presence ?? 'offline',
        gamesPlayed: player.gamesPlayed ?? 0,
        gamesWon: player.gamesWon ?? 0,
    }));
    return { players };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Reports a player, message or username for moderation review. */
exports.submitReport = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('submitReport', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'report', 10, 60 * 60 * 1000);
    const targetType = (0, guards_1.requireString)(data?.targetType, 'targetType', 20);
    if (!['player', 'message', 'username'].includes(targetType)) {
        throw (0, errors_1.appError)('invalid_argument', 'invalid-argument', 'Unknown report type.');
    }
    const targetId = (0, guards_1.requireString)(data?.targetId, 'targetId', 200);
    if (targetId === uid)
        throw (0, errors_1.appError)('self_action', 'failed-precondition');
    const reason = (0, guards_1.requireString)(data?.reason, 'reason', 500);
    await admin_1.col.reports().add({
        reporterId: uid,
        targetType,
        targetId,
        reason,
        context: data?.context ? String(data.context).slice(0, 500) : null,
        status: 'open',
        createdAt: admin_1.FieldValue.serverTimestamp(),
    });
    return { submitted: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=users.js.map
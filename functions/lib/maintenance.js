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
exports.sweepPresence = exports.enforceTurnDeadlines = exports.cleanupExpiredInvitations = exports.cleanupExpiredLobbies = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const admin_1 = require("./lib/admin");
const codes_1 = require("./lib/codes");
const game_1 = require("./shared/game");
/** Closes lobbies that nobody ever started. */
exports.cleanupExpiredLobbies = (0, scheduler_1.onSchedule)('every 30 minutes', async () => {
    const cutoff = admin_1.Timestamp.fromMillis(Date.now());
    const snap = await admin_1.col
        .lobbies()
        .where('status', '==', 'open')
        .where('expiresAt', '<', cutoff)
        .limit(200)
        .get();
    const batch = admin_1.db.batch();
    for (const doc of snap.docs) {
        batch.update(doc.ref, { status: 'closed', updatedAt: admin_1.FieldValue.serverTimestamp() });
        await (0, codes_1.releaseJoinCode)(doc.data().joinCode);
    }
    if (!snap.empty)
        await batch.commit();
    logger.info(`cleanupExpiredLobbies closed ${snap.size} lobbies`);
});
/** Expires invitations nobody answered. */
exports.cleanupExpiredInvitations = (0, scheduler_1.onSchedule)('every 30 minutes', async () => {
    const snap = await admin_1.col
        .invitations()
        .where('status', '==', 'pending')
        .where('expiresAt', '<', admin_1.Timestamp.now())
        .limit(400)
        .get();
    if (snap.empty)
        return;
    const batch = admin_1.db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { status: 'expired' }));
    await batch.commit();
    logger.info(`cleanupExpiredInvitations expired ${snap.size} invitations`);
});
/**
 * Safety net for abandoned turns. The in-game clients also call
 * `enforceTurnTimeout`, but this keeps games moving even when every browser
 * is closed.
 */
exports.enforceTurnDeadlines = (0, scheduler_1.onSchedule)('every 2 minutes', async () => {
    const snap = await admin_1.col
        .games()
        .where('status', '==', 'playing')
        .where('turnDeadline', '<', admin_1.Timestamp.now())
        .limit(40)
        .get();
    for (const doc of snap.docs) {
        const gameId = doc.id;
        try {
            await admin_1.db.runTransaction(async (tx) => {
                const gameRef = admin_1.col.game(gameId);
                const secretRef = admin_1.col.gameSecret(gameId);
                const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
                if (!gameSnap.exists || !secretSnap.exists)
                    return;
                const game = gameSnap.data();
                if (game.status !== 'playing')
                    return;
                if (!game.turnDeadline || game.turnDeadline.toMillis() > Date.now())
                    return;
                const state = secretSnap.data().state;
                const target = (0, game_1.currentPlayerId)(state);
                if (!target)
                    return;
                const result = (0, game_1.autoPlayTurn)(state, target);
                if (!result.ok)
                    return;
                tx.set(secretRef, { state: result.state }, { merge: true });
                tx.update(gameRef, {
                    turnDeadline: admin_1.Timestamp.fromMillis(Date.now() + (game.settings?.turnTimeoutSeconds ?? 120) * 1000),
                    updatedAt: admin_1.FieldValue.serverTimestamp(),
                });
            });
        }
        catch (error) {
            logger.error('enforceTurnDeadlines failed', { gameId, error });
        }
    }
});
/** Marks stale presence heartbeats as offline. */
exports.sweepPresence = (0, scheduler_1.onSchedule)('every 10 minutes', async () => {
    const cutoff = admin_1.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const snap = await admin_1.col
        .users()
        .where('isOnline', '==', true)
        .where('lastSeenAt', '<', cutoff)
        .limit(300)
        .get();
    if (snap.empty)
        return;
    const batch = admin_1.db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { isOnline: false, presence: 'offline' }));
    await batch.commit();
});
//# sourceMappingURL=maintenance.js.map
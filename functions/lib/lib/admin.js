"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.millisFromNow = exports.now = exports.col = exports.ENFORCE_APP_CHECK = exports.getDatabase = exports.Timestamp = exports.FieldValue = exports.auth = exports.db = exports.REGION = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
Object.defineProperty(exports, "Timestamp", { enumerable: true, get: function () { return firestore_1.Timestamp; } });
const auth_1 = require("firebase-admin/auth");
const database_1 = require("firebase-admin/database");
Object.defineProperty(exports, "getDatabase", { enumerable: true, get: function () { return database_1.getDatabase; } });
const v2_1 = require("firebase-functions/v2");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
exports.REGION = process.env.FUNCTIONS_REGION || 'us-central1';
(0, v2_1.setGlobalOptions)({
    region: exports.REGION,
    maxInstances: 20,
    memory: '512MiB',
    timeoutSeconds: 60,
});
exports.db = (0, firestore_1.getFirestore)();
// Optional meld fields (`rank`, `suit`, `startRank`) are absent rather than
// null for some melds; this keeps Firestore from rejecting the write.
exports.db.settings({ ignoreUndefinedProperties: true });
exports.auth = (0, auth_1.getAuth)();
/** App Check is enforced in production; disable it for local emulator work. */
exports.ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
exports.col = {
    users: () => exports.db.collection('users'),
    user: (uid) => exports.db.collection('users').doc(uid),
    userPrivate: (uid) => exports.db.collection('users').doc(uid).collection('private').doc('profile'),
    usernames: () => exports.db.collection('usernames'),
    username: (nameLower) => exports.db.collection('usernames').doc(nameLower),
    friends: () => exports.db.collection('friends'),
    friendship: (pairKey) => exports.db.collection('friends').doc(pairKey),
    invitations: () => exports.db.collection('gameInvitations'),
    invitation: (id) => exports.db.collection('gameInvitations').doc(id),
    notifications: () => exports.db.collection('notifications'),
    lobbies: () => exports.db.collection('lobbies'),
    lobby: (id) => exports.db.collection('lobbies').doc(id),
    lobbyCodes: () => exports.db.collection('lobbyCodes'),
    lobbyCode: (code) => exports.db.collection('lobbyCodes').doc(code),
    games: () => exports.db.collection('games'),
    game: (id) => exports.db.collection('games').doc(id),
    gamePlayers: (id) => exports.db.collection('games').doc(id).collection('players'),
    gamePlayer: (id, uid) => exports.db.collection('games').doc(id).collection('players').doc(uid),
    gameHand: (id, uid) => exports.db.collection('games').doc(id).collection('hands').doc(uid),
    gameSecret: (id) => exports.db.collection('games').doc(id).collection('secret').doc('state'),
    gameRounds: (id) => exports.db.collection('games').doc(id).collection('rounds'),
    gameEvents: (id) => exports.db.collection('games').doc(id).collection('events'),
    gameChat: (id) => exports.db.collection('games').doc(id).collection('chat'),
    lobbyChat: (id) => exports.db.collection('lobbies').doc(id).collection('chat'),
    history: () => exports.db.collection('gameHistory'),
    historyDoc: (id) => exports.db.collection('gameHistory').doc(id),
    reports: () => exports.db.collection('reports'),
    rateLimit: (key) => exports.db.collection('rateLimits').doc(key),
};
const now = () => firestore_1.FieldValue.serverTimestamp();
exports.now = now;
const millisFromNow = (ms) => firestore_1.Timestamp.fromMillis(Date.now() + ms);
exports.millisFromNow = millisFromNow;
//# sourceMappingURL=admin.js.map
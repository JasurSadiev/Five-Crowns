"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepPresence = exports.enforceTurnDeadlines = exports.cleanupExpiredInvitations = exports.cleanupExpiredLobbies = exports.getLeaderboard = exports.updateStatistics = exports.sendChatMessage = exports.leaveGame = exports.joinAsSpectator = exports.pingGame = exports.enforceTurnTimeout = exports.advanceRound = exports.goOut = exports.discardCard = exports.takeDiscard = exports.drawCard = exports.startGame = exports.unblockPlayer = exports.blockPlayer = exports.removeFriend = exports.respondToFriendRequest = exports.sendFriendRequest = exports.cancelInvitation = exports.respondToInvitation = exports.invitePlayer = exports.listPublicLobbies = exports.cancelLobby = exports.updateLobbySettings = exports.kickPlayer = exports.leaveLobby = exports.joinLobbyByCode = exports.joinLobby = exports.createLobby = exports.submitReport = exports.searchPlayers = exports.deleteAccount = exports.syncEmailVerified = exports.updateAvatar = exports.updateUsername = exports.ensureProfile = exports.onUserCreated = void 0;
/**
 * Five Crowns - trusted server logic.
 *
 * Every authoritative mutation lives here. The browser may only *request*
 * actions; these functions decide whether they are legal, apply them inside a
 * Firestore transaction, and publish the result. Firestore Security Rules deny
 * all direct client writes to game state (see `firestore.rules`).
 */
require("./lib/admin");
// Accounts and profiles
var users_1 = require("./users");
Object.defineProperty(exports, "onUserCreated", { enumerable: true, get: function () { return users_1.onUserCreated; } });
Object.defineProperty(exports, "ensureProfile", { enumerable: true, get: function () { return users_1.ensureProfile; } });
Object.defineProperty(exports, "updateUsername", { enumerable: true, get: function () { return users_1.updateUsername; } });
Object.defineProperty(exports, "updateAvatar", { enumerable: true, get: function () { return users_1.updateAvatar; } });
Object.defineProperty(exports, "syncEmailVerified", { enumerable: true, get: function () { return users_1.syncEmailVerified; } });
Object.defineProperty(exports, "deleteAccount", { enumerable: true, get: function () { return users_1.deleteAccount; } });
Object.defineProperty(exports, "searchPlayers", { enumerable: true, get: function () { return users_1.searchPlayers; } });
Object.defineProperty(exports, "submitReport", { enumerable: true, get: function () { return users_1.submitReport; } });
// Lobbies
var lobbies_1 = require("./lobbies");
Object.defineProperty(exports, "createLobby", { enumerable: true, get: function () { return lobbies_1.createLobby; } });
Object.defineProperty(exports, "joinLobby", { enumerable: true, get: function () { return lobbies_1.joinLobby; } });
Object.defineProperty(exports, "joinLobbyByCode", { enumerable: true, get: function () { return lobbies_1.joinLobbyByCode; } });
Object.defineProperty(exports, "leaveLobby", { enumerable: true, get: function () { return lobbies_1.leaveLobby; } });
Object.defineProperty(exports, "kickPlayer", { enumerable: true, get: function () { return lobbies_1.kickPlayer; } });
Object.defineProperty(exports, "updateLobbySettings", { enumerable: true, get: function () { return lobbies_1.updateLobbySettings; } });
Object.defineProperty(exports, "cancelLobby", { enumerable: true, get: function () { return lobbies_1.cancelLobby; } });
Object.defineProperty(exports, "listPublicLobbies", { enumerable: true, get: function () { return lobbies_1.listPublicLobbies; } });
// Invitations
var invitations_1 = require("./invitations");
Object.defineProperty(exports, "invitePlayer", { enumerable: true, get: function () { return invitations_1.invitePlayer; } });
Object.defineProperty(exports, "respondToInvitation", { enumerable: true, get: function () { return invitations_1.respondToInvitation; } });
Object.defineProperty(exports, "cancelInvitation", { enumerable: true, get: function () { return invitations_1.cancelInvitation; } });
// Friends
var friends_1 = require("./friends");
Object.defineProperty(exports, "sendFriendRequest", { enumerable: true, get: function () { return friends_1.sendFriendRequest; } });
Object.defineProperty(exports, "respondToFriendRequest", { enumerable: true, get: function () { return friends_1.respondToFriendRequest; } });
Object.defineProperty(exports, "removeFriend", { enumerable: true, get: function () { return friends_1.removeFriend; } });
Object.defineProperty(exports, "blockPlayer", { enumerable: true, get: function () { return friends_1.blockPlayer; } });
Object.defineProperty(exports, "unblockPlayer", { enumerable: true, get: function () { return friends_1.unblockPlayer; } });
// Gameplay
var game_1 = require("./game");
Object.defineProperty(exports, "startGame", { enumerable: true, get: function () { return game_1.startGame; } });
Object.defineProperty(exports, "drawCard", { enumerable: true, get: function () { return game_1.drawCard; } });
Object.defineProperty(exports, "takeDiscard", { enumerable: true, get: function () { return game_1.takeDiscard; } });
Object.defineProperty(exports, "discardCard", { enumerable: true, get: function () { return game_1.discardCard; } });
Object.defineProperty(exports, "goOut", { enumerable: true, get: function () { return game_1.goOut; } });
Object.defineProperty(exports, "advanceRound", { enumerable: true, get: function () { return game_1.advanceRound; } });
Object.defineProperty(exports, "enforceTurnTimeout", { enumerable: true, get: function () { return game_1.enforceTurnTimeout; } });
Object.defineProperty(exports, "pingGame", { enumerable: true, get: function () { return game_1.pingGame; } });
Object.defineProperty(exports, "joinAsSpectator", { enumerable: true, get: function () { return game_1.joinAsSpectator; } });
Object.defineProperty(exports, "leaveGame", { enumerable: true, get: function () { return game_1.leaveGame; } });
// Chat
var chat_1 = require("./chat");
Object.defineProperty(exports, "sendChatMessage", { enumerable: true, get: function () { return chat_1.sendChatMessage; } });
// Statistics and leaderboards
var stats_1 = require("./stats");
Object.defineProperty(exports, "updateStatistics", { enumerable: true, get: function () { return stats_1.updateStatistics; } });
Object.defineProperty(exports, "getLeaderboard", { enumerable: true, get: function () { return stats_1.getLeaderboard; } });
// Scheduled maintenance
var maintenance_1 = require("./maintenance");
Object.defineProperty(exports, "cleanupExpiredLobbies", { enumerable: true, get: function () { return maintenance_1.cleanupExpiredLobbies; } });
Object.defineProperty(exports, "cleanupExpiredInvitations", { enumerable: true, get: function () { return maintenance_1.cleanupExpiredInvitations; } });
Object.defineProperty(exports, "enforceTurnDeadlines", { enumerable: true, get: function () { return maintenance_1.enforceTurnDeadlines; } });
Object.defineProperty(exports, "sweepPresence", { enumerable: true, get: function () { return maintenance_1.sweepPresence; } });
//# sourceMappingURL=index.js.map
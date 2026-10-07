/**
 * Five Crowns - trusted server logic.
 *
 * Every authoritative mutation lives here. The browser may only *request*
 * actions; these functions decide whether they are legal, apply them inside a
 * Firestore transaction, and publish the result. Firestore Security Rules deny
 * all direct client writes to game state (see `firestore.rules`).
 */
import './lib/admin';

// Accounts and profiles
export {
  onUserCreated,
  ensureProfile,
  updateUsername,
  updateAvatar,
  syncEmailVerified,
  deleteAccount,
  searchPlayers,
  submitReport,
} from './users';

// Lobbies
export {
  createLobby,
  joinLobby,
  joinLobbyByCode,
  leaveLobby,
  kickPlayer,
  updateLobbySettings,
  cancelLobby,
  listPublicLobbies,
} from './lobbies';

// Invitations
export { invitePlayer, respondToInvitation, cancelInvitation } from './invitations';

// Friends
export {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  blockPlayer,
  unblockPlayer,
} from './friends';

// Gameplay
export {
  startGame,
  drawCard,
  takeDiscard,
  discardCard,
  goOut,
  advanceRound,
  enforceTurnTimeout,
  pingGame,
  joinAsSpectator,
  leaveGame,
} from './game';

// Chat
export { sendChatMessage } from './chat';

// Statistics and leaderboards
export { updateStatistics, getLeaderboard } from './stats';

// Scheduled maintenance
export {
  cleanupExpiredLobbies,
  cleanupExpiredInvitations,
  enforceTurnDeadlines,
  sweepPresence,
} from './maintenance';

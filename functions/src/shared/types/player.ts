import type { AnyTimestamp } from './game';

export type PresenceState = 'online' | 'away' | 'offline';

/**
 * PUBLIC profile - `users/{uid}`.
 * Readable by any signed-in player, so it must never contain an email address,
 * notification preferences or anything else private. Only Cloud Functions may
 * write the statistics fields.
 */
export interface UserProfile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  photoURL: string | null;
  createdAt: AnyTimestamp;
  lastSeenAt: AnyTimestamp;
  isOnline: boolean;
  presence: PresenceState;
  /** Authoritative statistics - only ever written by Cloud Functions. */
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalScore: number;
  bestScore: number | null;
  worstScore: number | null;
  averageScore: number;
  roundsPlayed: number;
  roundsWon: number;
  totalRoundScore: number;
  currentStreak: number;
  bestStreak: number;
  /** Soft moderation flag set by moderation hooks. */
  suspended?: boolean;
}

/**
 * PRIVATE profile - `users/{uid}/private/profile`.
 * Readable and writable only by its owner (and by Cloud Functions).
 */
export interface UserPrivate {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  settings: UserSettings;
  privacy: PrivacySettings;
  /** uids this player has blocked. */
  blocked: string[];
  updatedAt: AnyTimestamp;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  animations: boolean;
  reduceMotion: boolean;
  largeCards: boolean;
  autoSortCards: boolean;
  confirmDiscard: boolean;
  highContrast: boolean;
  soundEffects: boolean;
  music: boolean;
  browserNotifications: boolean;
  showTutorial: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'system',
  animations: true,
  reduceMotion: false,
  largeCards: false,
  autoSortCards: true,
  confirmDiscard: false,
  highContrast: false,
  soundEffects: true,
  music: false,
  browserNotifications: false,
  showTutorial: true,
};

export interface PrivacySettings {
  allowFriendRequests: boolean;
  allowGameInvitations: 'everyone' | 'friends' | 'nobody';
  showOnlineStatus: boolean;
  appearOnLeaderboard: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  allowFriendRequests: true,
  allowGameInvitations: 'everyone',
  showOnlineStatus: true,
  appearOnLeaderboard: true,
};

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  averageScore: number;
  bestScore: number | null;
  worstScore: number | null;
  averageRoundScore: number;
  roundsWon: number;
  currentStreak: number;
  bestStreak: number;
}

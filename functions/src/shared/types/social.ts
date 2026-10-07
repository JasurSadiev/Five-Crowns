import type { AnyTimestamp } from './game';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface Friendship {
  id: string;
  /** Sorted pair key `uidA_uidB` guaranteeing one document per relationship. */
  pairKey: string;
  requesterId: string;
  recipientId: string;
  members: string[];
  status: FriendshipStatus;
  /** For blocks: who performed the block. */
  blockedBy: string | null;
  createdAt: AnyTimestamp;
  updatedAt: AnyTimestamp;
  profiles: Record<string, { displayName: string; photoURL: string | null }>;
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface GameInvitation {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoURL: string | null;
  recipientId: string;
  lobbyId: string;
  joinCode: string;
  status: InvitationStatus;
  createdAt: AnyTimestamp;
  expiresAt: AnyTimestamp;
  respondedAt: AnyTimestamp;
}

export type NotificationType =
  | 'game_invitation'
  | 'friend_request'
  | 'friend_accepted'
  | 'game_starting'
  | 'your_turn'
  | 'game_finished'
  | 'system';

export interface AppNotification {
  id: string;
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  read: boolean;
  createdAt: AnyTimestamp;
  data: Record<string, string>;
}

export type ReportTargetType = 'player' | 'message' | 'username';

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  context: string | null;
  reason: string;
  createdAt: AnyTimestamp;
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  averageScore: number;
  bestScore: number | null;
  updatedAt: AnyTimestamp;
}

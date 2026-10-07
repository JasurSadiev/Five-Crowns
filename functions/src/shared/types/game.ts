/**
 * Game, round and lobby documents.
 *
 * These types are shared verbatim between the browser bundle and the Cloud
 * Functions bundle (see `scripts/sync-engine.mjs`), so they must never import
 * from `firebase/*` or `firebase-admin/*`. Timestamps are therefore modelled
 * structurally.
 */

import type { Card, Meld, Rank } from './card';

/** Structural stand-in for both `firebase.Timestamp` and `admin.firestore.Timestamp`. */
export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
  toMillis?: () => number;
}

export type AnyTimestamp = TimestampLike | Date | number | null;

export type GameStatus =
  | 'waiting'
  | 'starting'
  | 'playing'
  | 'round_complete'
  | 'finished'
  | 'cancelled';

export type RoundStatus = 'waiting' | 'playing' | 'final_turns' | 'complete';

export type TurnPhase = 'draw' | 'discard';

export type LobbyStatus = 'open' | 'starting' | 'in_game' | 'closed' | 'cancelled';

export type Privacy = 'private' | 'public';

export type PlayerConnection = 'online' | 'away' | 'disconnected';

export interface GameSettings {
  privacy: Privacy;
  maxPlayers: number;
  allowSpectators: boolean;
  showAvatars: boolean;
  enableSound: boolean;
  enableAnimations: boolean;
  enableChat: boolean;
  /** Seconds a player has to act before the turn can be auto-played. */
  turnTimeoutSeconds: number;
  /** `host` = host presses continue, `auto` = countdown advances the round. */
  roundAdvance: 'host' | 'auto';
  autoAdvanceSeconds: number;
  /** Official rules allow either shared victory or a 6-card tie-break round. */
  tieBreak: 'shared_win' | 'tie_break_round';
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  privacy: 'private',
  maxPlayers: 7,
  allowSpectators: false,
  showAvatars: true,
  enableSound: true,
  enableAnimations: true,
  enableChat: true,
  turnTimeoutSeconds: 120,
  roundAdvance: 'host',
  autoAdvanceSeconds: 20,
  tieBreak: 'shared_win',
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;
export const TOTAL_ROUNDS = 11;

export interface LobbyPlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  seat: number;
  isHost: boolean;
  joinedAt: AnyTimestamp;
  ready: boolean;
}

export interface Lobby {
  id: string;
  joinCode: string;
  hostId: string;
  hostName: string;
  status: LobbyStatus;
  createdAt: AnyTimestamp;
  updatedAt: AnyTimestamp;
  expiresAt: AnyTimestamp;
  maxPlayers: number;
  playerIds: string[];
  players: LobbyPlayer[];
  settings: GameSettings;
  gameId: string | null;
  gameType: 'classic';
}

/** Public, non-secret information about an opponent at the table. */
export interface GamePlayerPublic {
  uid: string;
  displayName: string;
  photoURL: string | null;
  seat: number;
  cardCount: number;
  totalScore: number;
  roundScore: number | null;
  connection: PlayerConnection;
  lastSeenAt: AnyTimestamp;
  isHost: boolean;
  hasGoneOut: boolean;
  /** Melds are only published once the round is complete. */
  melds: Meld[];
  leftover: Card[];
}

/** Private per-player document: `games/{gameId}/hands/{uid}`. */
export interface PlayerHand {
  uid: string;
  gameId: string;
  round: number;
  cards: Card[];
  /** Client-chosen presentation order (card ids). Purely cosmetic. */
  order: string[];
  updatedAt: AnyTimestamp;
}

export interface DiscardTop {
  card: Card | null;
  /** uid of the player who discarded it. */
  by: string | null;
}

export interface Game {
  id: string;
  lobbyId: string;
  hostId: string;
  status: GameStatus;
  roundStatus: RoundStatus;
  currentRound: number;
  wildRank: Rank;
  cardsThisRound: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  /** Monotonic counter; every authoritative mutation bumps it. */
  actionSeq: number;
  turnOrder: string[];
  playerIds: string[];
  spectatorIds: string[];
  settings: GameSettings;
  drawPileCount: number;
  discardPileCount: number;
  discardTop: DiscardTop;
  /** uid of the player who went out this round, if any. */
  wentOutBy: string | null;
  /** uids that still owe a final turn after someone went out. */
  finalTurnsRemaining: string[];
  totals: Record<string, number>;
  roundScores: Record<string, number> | null;
  winnerIds: string[];
  createdAt: AnyTimestamp;
  updatedAt: AnyTimestamp;
  startedAt: AnyTimestamp;
  finishedAt: AnyTimestamp;
  turnStartedAt: AnyTimestamp;
  turnDeadline: AnyTimestamp;
  /** Set when the round ends and `settings.roundAdvance === 'auto'`. */
  nextRoundAt: AnyTimestamp;
  isTieBreakRound: boolean;
}

export interface RoundSummaryPlayer {
  uid: string;
  displayName: string;
  roundScore: number;
  totalScore: number;
  melds: Meld[];
  leftover: Card[];
  wentOut: boolean;
}

export interface RoundSummary {
  id: string;
  roundNumber: number;
  wildRank: Rank;
  cardsDealt: number;
  dealerId: string;
  wentOutBy: string | null;
  players: RoundSummaryPlayer[];
  startedAt: AnyTimestamp;
  completedAt: AnyTimestamp;
}

export type GameEventType =
  | 'game_started'
  | 'round_started'
  | 'draw_stock'
  | 'draw_discard'
  | 'discard'
  | 'went_out'
  | 'final_turn'
  | 'turn_timeout'
  | 'round_complete'
  | 'game_complete'
  | 'player_joined'
  | 'player_left'
  | 'player_disconnected'
  | 'player_reconnected';

export interface GameEvent {
  id: string;
  seq: number;
  type: GameEventType;
  round: number;
  actorId: string | null;
  actorName: string | null;
  /** Only ever public information - safe to show in replays. */
  payload: Record<string, unknown>;
  createdAt: AnyTimestamp;
}

export interface GameHistoryEntry {
  id: string;
  gameId: string;
  playerIds: string[];
  players: Array<{
    uid: string;
    displayName: string;
    photoURL: string | null;
    finalScore: number;
    rank: number;
    roundScores: number[];
  }>;
  winnerIds: string[];
  winnerNames: string[];
  rounds: number;
  durationMs: number;
  startedAt: AnyTimestamp;
  finishedAt: AnyTimestamp;
  isTie: boolean;
}

export interface ChatMessage {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  text: string;
  createdAt: AnyTimestamp;
  system?: boolean;
}

import {
  collection,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import type {
  ChatMessage,
  Game,
  GameEvent,
  GameHistoryEntry,
  GamePlayerPublic,
  Lobby,
  PlayerHand,
  RoundSummary,
} from '../types/game';
import type { UserPrivate, UserProfile } from '../types/player';
import type { AppNotification, Friendship, GameInvitation } from '../types/social';

/** Thin, typed subscription helpers. Every listener is selective on purpose. */

type Handler<T> = (value: T) => void;
type ErrorHandler = (error: Error) => void;

function docListener<T>(path: string[], onValue: Handler<T | null>, onError?: ErrorHandler): Unsubscribe {
  const ref = doc(db, path[0], ...path.slice(1));
  return onSnapshot(
    ref,
    (snap) => onValue(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null),
    (error) => onError?.(error),
  );
}

function listListener<T>(
  path: string[],
  constraints: QueryConstraint[],
  onValue: Handler<T[]>,
  onError?: ErrorHandler,
): Unsubscribe {
  const ref = collection(db, path[0], ...path.slice(1));
  return onSnapshot(
    query(ref, ...constraints),
    (snap) => onValue(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    (error) => onError?.(error),
  );
}

export const watch = {
  profile: (uid: string, cb: Handler<UserProfile | null>, onError?: ErrorHandler) =>
    docListener<UserProfile>(['users', uid], cb, onError),

  privateProfile: (uid: string, cb: Handler<UserPrivate | null>, onError?: ErrorHandler) =>
    docListener<UserPrivate>(['users', uid, 'private', 'profile'], cb, onError),

  lobby: (lobbyId: string, cb: Handler<Lobby | null>, onError?: ErrorHandler) =>
    docListener<Lobby>(['lobbies', lobbyId], cb, onError),

  game: (gameId: string, cb: Handler<Game | null>, onError?: ErrorHandler) =>
    docListener<Game>(['games', gameId], cb, onError),

  gamePlayers: (gameId: string, cb: Handler<GamePlayerPublic[]>, onError?: ErrorHandler) =>
    listListener<GamePlayerPublic>(['games', gameId, 'players'], [], cb, onError),

  /** Only ever called with the signed-in player's own uid. */
  hand: (gameId: string, uid: string, cb: Handler<PlayerHand | null>, onError?: ErrorHandler) =>
    docListener<PlayerHand>(['games', gameId, 'hands', uid], cb, onError),

  rounds: (gameId: string, cb: Handler<RoundSummary[]>, onError?: ErrorHandler) =>
    listListener<RoundSummary>(['games', gameId, 'rounds'], [orderBy('roundNumber')], cb, onError),

  events: (gameId: string, max: number, cb: Handler<GameEvent[]>, onError?: ErrorHandler) =>
    listListener<GameEvent>(
      ['games', gameId, 'events'],
      [orderBy('createdAt', 'desc'), fsLimit(max)],
      (events) => cb([...events].reverse()),
      onError,
    ),

  gameChat: (gameId: string, max: number, cb: Handler<ChatMessage[]>, onError?: ErrorHandler) =>
    listListener<ChatMessage>(
      ['games', gameId, 'chat'],
      [orderBy('createdAt', 'desc'), fsLimit(max)],
      (messages) => cb([...messages].reverse()),
      onError,
    ),

  lobbyChat: (lobbyId: string, max: number, cb: Handler<ChatMessage[]>, onError?: ErrorHandler) =>
    listListener<ChatMessage>(
      ['lobbies', lobbyId, 'chat'],
      [orderBy('createdAt', 'desc'), fsLimit(max)],
      (messages) => cb([...messages].reverse()),
      onError,
    ),

  invitations: (uid: string, cb: Handler<GameInvitation[]>, onError?: ErrorHandler) =>
    listListener<GameInvitation>(
      ['gameInvitations'],
      [
        where('recipientId', '==', uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        fsLimit(20),
      ],
      cb,
      onError,
    ),

  notifications: (uid: string, cb: Handler<AppNotification[]>, onError?: ErrorHandler) =>
    listListener<AppNotification>(
      ['notifications'],
      [where('uid', '==', uid), orderBy('createdAt', 'desc'), fsLimit(25)],
      cb,
      onError,
    ),

  friends: (uid: string, cb: Handler<Friendship[]>, onError?: ErrorHandler) =>
    listListener<Friendship>(
      ['friends'],
      [where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'), fsLimit(100)],
      cb,
      onError,
    ),

  history: (uid: string, max: number, cb: Handler<GameHistoryEntry[]>, onError?: ErrorHandler) =>
    listListener<GameHistoryEntry>(
      ['gameHistory'],
      [where('playerIds', 'array-contains', uid), orderBy('finishedAt', 'desc'), fsLimit(max)],
      cb,
      onError,
    ),

  activeGames: (uid: string, cb: Handler<Game[]>, onError?: ErrorHandler) =>
    listListener<Game>(
      ['games'],
      [
        where('playerIds', 'array-contains', uid),
        where('status', 'in', ['playing', 'round_complete']),
        orderBy('updatedAt', 'desc'),
        fsLimit(10),
      ],
      cb,
      onError,
    ),
};

export { db, doc, collection, type DocumentData };

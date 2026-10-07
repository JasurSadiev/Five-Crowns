import { onCall } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { ENFORCE_APP_CHECK, FieldValue, Timestamp, col, db } from './lib/admin';
import { appError, handler } from './lib/errors';
import {
  alreadyProcessed,
  optionalString,
  rememberRequest,
  requireAuth,
  requireString,
} from './lib/guards';
import { releaseJoinCode } from './lib/codes';
import { notifyMany } from './lib/notify';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  TOTAL_ROUNDS,
  type Game,
  type GameSettings,
  type LobbyPlayer,
  type RoundSummary,
} from './shared/types/game';
import type { Card, Meld } from './shared/types/card';
import {
  TIE_BREAK_CARDS,
  TIE_BREAK_WILD_RANK,
  addRoundScores,
  autoPlayTurn,
  computeRankings,
  currentPlayerId,
  dealerIndexForRound,
  discard as engineDiscard,
  drawFromStock,
  startRound,
  takeDiscard as engineTakeDiscard,
  topDiscard,
  winnersFromTotals,
  type EngineEvent,
  type EngineResult,
  type RoundState,
} from './shared/game';

interface SecretDoc {
  state: RoundState;
  processed?: Record<string, number>;
  /** Scores of the optional tie-break round, kept out of the main totals. */
  tieBreakScores?: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* Writers                                                                     */
/* -------------------------------------------------------------------------- */

function turnTimestamps(settings: GameSettings) {
  return {
    turnStartedAt: Timestamp.now(),
    turnDeadline: Timestamp.fromMillis(Date.now() + settings.turnTimeoutSeconds * 1000),
  };
}

function publicGameFields(state: RoundState, settings: GameSettings, discardedBy?: string | null) {
  const top = topDiscard(state.discardPile);
  return {
    roundStatus: state.status,
    currentRound: state.round,
    wildRank: state.wildRank,
    cardsThisRound: state.cardsDealt,
    dealerIndex: state.dealerIndex,
    currentPlayerIndex: state.currentPlayerIndex,
    currentPlayerId: currentPlayerId(state),
    turnPhase: state.turnPhase,
    actionSeq: state.actionSeq,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    discardTop: { card: top, by: top ? (discardedBy ?? null) : null },
    wentOutBy: state.wentOutBy,
    finalTurnsRemaining: state.finalTurnsRemaining,
    updatedAt: FieldValue.serverTimestamp(),
    ...turnTimestamps(settings),
  };
}

function writeHand(tx: Transaction, gameId: string, state: RoundState, uid: string): void {
  const player = state.players[uid];
  tx.set(
    col.gameHand(gameId, uid),
    {
      uid,
      gameId,
      round: state.round,
      cards: player.hand,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function writePlayerPublic(
  tx: Transaction,
  gameId: string,
  state: RoundState,
  uid: string,
  extra: Record<string, unknown> = {},
): void {
  const player = state.players[uid];
  tx.set(
    col.gamePlayer(gameId, uid),
    {
      uid,
      cardCount: player.hand.length,
      hasGoneOut: player.hasGoneOut,
      roundScore: player.roundScore,
      melds: state.status === 'complete' ? player.melds : [],
      leftover: state.status === 'complete' ? player.leftover : [],
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    },
    { merge: true },
  );
}

function writeEvents(
  tx: Transaction,
  gameId: string,
  state: RoundState,
  events: EngineEvent[],
  names: Record<string, string>,
): void {
  events.forEach((event, index) => {
    const ref = col.gameEvents(gameId).doc();
    tx.set(ref, {
      id: ref.id,
      seq: state.actionSeq * 100 + index,
      type: event.type,
      round: state.round,
      actorId: event.actorId,
      actorName: event.actorId ? (names[event.actorId] ?? null) : null,
      payload: event.payload ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Start a game                                                                */
/* -------------------------------------------------------------------------- */

export const startGame = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('startGame', async (data: { lobbyId?: string }, uid: string) => {
      const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
      let releasedCode: string | null = null;

      const gameId = await db.runTransaction(async (tx) => {
        const lobbyRef = col.lobby(lobbyId);
        const lobbySnap = await tx.get(lobbyRef);
        if (!lobbySnap.exists) throw appError('lobby_not_found', 'not-found');
        const lobby = lobbySnap.data() as {
          hostId: string;
          status: string;
          joinCode: string;
          players: LobbyPlayer[];
          playerIds: string[];
          settings: GameSettings;
          gameId: string | null;
        };
        if (lobby.hostId !== uid) throw appError('not_host', 'permission-denied');
        // A game can never start twice: the lobby must still be open.
        if (lobby.status !== 'open') {
          if (lobby.gameId) return lobby.gameId;
          throw appError('lobby_closed', 'failed-precondition');
        }
        if (lobby.playerIds.length < MIN_PLAYERS) {
          throw appError('not_enough_players', 'failed-precondition');
        }
        if (lobby.playerIds.length > MAX_PLAYERS) {
          throw appError('too_many_players', 'failed-precondition');
        }

        const seated = [...lobby.players].sort((a, b) => a.seat - b.seat);
        const turnOrder = seated.map((player) => player.uid);
        const names = Object.fromEntries(seated.map((p) => [p.uid, p.displayName]));
        const { state, events } = startRound({
          round: 1,
          turnOrder,
          dealerIndex: dealerIndexForRound(1, turnOrder.length),
        });

        const gameRef = col.games().doc();
        const totals = Object.fromEntries(turnOrder.map((id) => [id, 0]));

        tx.set(gameRef, {
          id: gameRef.id,
          lobbyId,
          hostId: lobby.hostId,
          status: 'playing',
          playerIds: turnOrder,
          turnOrder,
          spectatorIds: [],
          settings: lobby.settings,
          totals,
          roundScores: null,
          winnerIds: [],
          isTieBreakRound: false,
          createdAt: FieldValue.serverTimestamp(),
          startedAt: FieldValue.serverTimestamp(),
          finishedAt: null,
          nextRoundAt: null,
          ...publicGameFields(state, lobby.settings),
        });
        tx.set(col.gameSecret(gameRef.id), {
          state,
          processed: {},
          updatedAt: FieldValue.serverTimestamp(),
        });

        seated.forEach((player) => {
          writeHand(tx, gameRef.id, state, player.uid);
          tx.set(col.gamePlayer(gameRef.id, player.uid), {
            uid: player.uid,
            displayName: player.displayName,
            photoURL: player.photoURL,
            seat: player.seat,
            isHost: player.uid === lobby.hostId,
            cardCount: state.players[player.uid].hand.length,
            totalScore: 0,
            roundScore: null,
            hasGoneOut: false,
            melds: [],
            leftover: [],
            connection: 'online',
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });

        writeEvents(tx, gameRef.id, state, events, names);
        tx.update(lobbyRef, {
          status: 'in_game',
          gameId: gameRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
        releasedCode = lobby.joinCode;
        return gameRef.id;
      });

      await releaseJoinCode(releasedCode);

      const playersSnap = await col.gamePlayers(gameId).get();
      await notifyMany(
        playersSnap.docs
          .map((doc) => doc.data())
          .filter((player) => player.uid !== uid)
          .map((player) => ({
            uid: player.uid as string,
            type: 'game_starting' as const,
            title: 'Your game is ready',
            body: 'Five Crowns has started - round 1, 3s are wild.',
            link: `/game/${gameId}`,
            data: { gameId },
          })),
      );

      return { gameId };
    })(request.data, requireAuth(request), request),
);

/* -------------------------------------------------------------------------- */
/* Shared mutation pipeline                                                    */
/* -------------------------------------------------------------------------- */

interface MutationContext {
  gameId: string;
  uid: string;
  requestId: string | null;
  /** Players whose private hand changed and must be rewritten. */
  mutate: (state: RoundState, game: Game) => EngineResult;
}

async function mutateGame(ctx: MutationContext): Promise<{ ok: true; replayed: boolean }> {
  await db.runTransaction(async (tx) => {
    const gameRef = col.game(ctx.gameId);
    const secretRef = col.gameSecret(ctx.gameId);
    const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
    if (!gameSnap.exists || !secretSnap.exists) throw appError('game_not_found', 'not-found');

    const game = gameSnap.data() as Game;
    const secret = secretSnap.data() as SecretDoc;

    if (alreadyProcessed(secret.processed, ctx.requestId)) return;
    if (!game.playerIds.includes(ctx.uid)) throw appError('not_in_game', 'permission-denied');
    if (game.status === 'finished' || game.status === 'cancelled') {
      throw appError('game_finished', 'failed-precondition');
    }
    if (game.status !== 'playing') throw appError('round_not_active', 'failed-precondition');

    const result = ctx.mutate(secret.state, game);
    if (!result.ok) throw appError(result.code, 'failed-precondition');

    const state = result.state;
    const names = await playerNames(tx, ctx.gameId, game.playerIds);

    tx.set(
      secretRef,
      {
        state,
        processed: rememberRequest(secret.processed, ctx.requestId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (state.status === 'complete') {
      finaliseRound(tx, ctx.gameId, game, state, result.events, names);
    } else {
      const discardedBy = result.events.find((event) => event.type === 'discard')?.actorId ?? null;
      writeHand(tx, ctx.gameId, state, ctx.uid);
      writePlayerPublic(tx, ctx.gameId, state, ctx.uid);
      tx.update(gameRef, publicGameFields(state, game.settings, discardedBy));
      writeEvents(tx, ctx.gameId, state, result.events, names);
    }
  });
  return { ok: true, replayed: false };
}

async function playerNames(
  tx: Transaction,
  gameId: string,
  playerIds: string[],
): Promise<Record<string, string>> {
  const refs = playerIds.map((uid) => col.gamePlayer(gameId, uid));
  if (!refs.length) return {};
  const snaps = await tx.getAll(...refs);
  const names: Record<string, string> = {};
  snaps.forEach((snap) => {
    const data = snap.data();
    if (data) names[data.uid as string] = (data.displayName as string) ?? 'Player';
  });
  return names;
}

/** Writes the round summary, totals and per-player results. */
function finaliseRound(
  tx: Transaction,
  gameId: string,
  game: Game,
  state: RoundState,
  events: EngineEvent[],
  names: Record<string, string>,
): void {
  const roundScores: Record<string, number> = {};
  for (const uid of state.turnOrder) {
    roundScores[uid] = state.players[uid].roundScore ?? 0;
  }

  const isTieBreak = Boolean(game.isTieBreakRound);
  const totals = isTieBreak ? game.totals : addRoundScores(game.totals ?? {}, roundScores);

  for (const uid of game.playerIds) {
    const player = state.players[uid];
    if (!player) continue;
    writeHand(tx, gameId, state, uid);
    writePlayerPublic(tx, gameId, state, uid, { totalScore: totals[uid] ?? 0 });
  }

  const summary: Omit<RoundSummary, 'startedAt'> & { gameId: string; isTieBreak: boolean } = {
    id: `${isTieBreak ? 'tb' : 'r'}${state.round}`,
    gameId,
    roundNumber: state.round,
    wildRank: state.wildRank,
    cardsDealt: state.cardsDealt,
    dealerId: state.turnOrder[state.dealerIndex],
    wentOutBy: state.wentOutBy,
    isTieBreak,
    players: state.turnOrder.map((uid) => ({
      uid,
      displayName: names[uid] ?? 'Player',
      roundScore: state.players[uid].roundScore ?? 0,
      totalScore: totals[uid] ?? 0,
      melds: state.players[uid].melds,
      leftover: state.players[uid].leftover,
      wentOut: state.players[uid].hasGoneOut,
    })),
    completedAt: null,
  };
  tx.set(col.gameRounds(gameId).doc(summary.id), {
    ...summary,
    completedAt: FieldValue.serverTimestamp(),
  });

  const autoAdvance = game.settings.roundAdvance === 'auto';
  tx.update(col.game(gameId), {
    ...publicGameFields(state, game.settings),
    status: 'round_complete',
    roundStatus: 'complete',
    roundScores,
    totals,
    nextRoundAt: autoAdvance
      ? Timestamp.fromMillis(Date.now() + game.settings.autoAdvanceSeconds * 1000)
      : null,
    turnDeadline: null,
  });

  writeEvents(tx, gameId, state, events, names);
}

/* -------------------------------------------------------------------------- */
/* Turn actions                                                                */
/* -------------------------------------------------------------------------- */

interface ActionInput {
  gameId?: string;
  requestId?: string;
}

export const drawCard = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('drawCard', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      return mutateGame({
        gameId,
        uid,
        requestId: optionalString(data?.requestId, 64),
        mutate: (state) => drawFromStock(state, uid),
      });
    })(request.data, requireAuth(request), request),
);

export const takeDiscard = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('takeDiscard', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      return mutateGame({
        gameId,
        uid,
        requestId: optionalString(data?.requestId, 64),
        mutate: (state) => engineTakeDiscard(state, uid),
      });
    })(request.data, requireAuth(request), request),
);

interface DiscardInput extends ActionInput {
  cardId?: string;
  goOut?: boolean;
  melds?: Array<{ type?: string; cards?: Array<{ id?: string }> }>;
}

/**
 * Normalises a client-submitted arrangement into engine melds. Only card ids
 * are trusted - the actual card data always comes from the server's state.
 */
function normaliseMelds(
  input: DiscardInput['melds'],
  hand: Card[],
): Meld[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const byId = new Map(hand.map((card) => [card.id, card]));
  const melds: Meld[] = [];
  for (const meld of input.slice(0, 8)) {
    const cards: Card[] = [];
    for (const entry of (meld?.cards ?? []).slice(0, 14)) {
      const card = entry?.id ? byId.get(entry.id) : undefined;
      if (!card) return undefined;
      cards.push(card);
    }
    melds.push({ type: meld?.type === 'run' ? 'run' : 'book', cards });
  }
  return melds;
}

export const discardCard = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('discardCard', async (data: DiscardInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      const cardId = requireString(data?.cardId, 'cardId', 40);
      return mutateGame({
        gameId,
        uid,
        requestId: optionalString(data?.requestId, 64),
        mutate: (state) =>
          engineDiscard(state, uid, cardId, {
            goOut: false,
            melds: normaliseMelds(data?.melds, state.players[uid]?.hand ?? []),
          }),
      });
    })(request.data, requireAuth(request), request),
);

export const goOut = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('goOut', async (data: DiscardInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      const cardId = requireString(data?.cardId, 'cardId', 40);
      return mutateGame({
        gameId,
        uid,
        requestId: optionalString(data?.requestId, 64),
        mutate: (state) =>
          engineDiscard(state, uid, cardId, {
            goOut: true,
            melds: normaliseMelds(data?.melds, state.players[uid]?.hand ?? []),
          }),
      });
    })(request.data, requireAuth(request), request),
);

/**
 * Plays a safe automatic turn once the clock has run out. Any player at the
 * table may ask for enforcement; the server checks the deadline itself.
 */
export const enforceTurnTimeout = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('enforceTurnTimeout', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      let timedOutPlayer: string | null = null;

      await db.runTransaction(async (tx) => {
        const gameRef = col.game(gameId);
        const secretRef = col.gameSecret(gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists) throw appError('game_not_found', 'not-found');
        const game = gameSnap.data() as Game;
        const secret = secretSnap.data() as SecretDoc;
        if (!game.playerIds.includes(uid) && !game.spectatorIds?.includes(uid)) {
          throw appError('not_in_game', 'permission-denied');
        }
        if (game.status !== 'playing') return;
        const deadline = game.turnDeadline as unknown as FirebaseFirestore.Timestamp | null;
        if (!deadline || deadline.toMillis() > Date.now()) return;

        const target = currentPlayerId(secret.state);
        if (!target) return;
        const result = autoPlayTurn(secret.state, target);
        if (!result.ok) return;
        timedOutPlayer = target;

        const state = result.state;
        const names = await playerNames(tx, gameId, game.playerIds);
        tx.set(
          secretRef,
          { state, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        const events: EngineEvent[] = [
          ...result.events.map((event) =>
            event.type === 'discard' ? { ...event, payload: { ...event.payload, timeout: true } } : event,
          ),
        ];
        if (state.status === 'complete') {
          finaliseRound(tx, gameId, game, state, events, names);
        } else {
          writeHand(tx, gameId, state, target);
          writePlayerPublic(tx, gameId, state, target, { connection: 'disconnected' });
          tx.update(gameRef, publicGameFields(state, game.settings, target));
          writeEvents(tx, gameId, state, events, names);
        }
      });

      return { timedOut: timedOutPlayer };
    })(request.data, requireAuth(request), request),
);

/* -------------------------------------------------------------------------- */
/* Round / game progression                                                    */
/* -------------------------------------------------------------------------- */

export const advanceRound = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('advanceRound', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      let finished = false;

      await db.runTransaction(async (tx) => {
        const gameRef = col.game(gameId);
        const secretRef = col.gameSecret(gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists) throw appError('game_not_found', 'not-found');
        const game = gameSnap.data() as Game;
        const secret = secretSnap.data() as SecretDoc;
        if (!game.playerIds.includes(uid)) throw appError('not_in_game', 'permission-denied');
        if (game.status === 'finished') {
          finished = true;
          return;
        }
        if (game.status !== 'round_complete') throw appError('round_in_progress', 'failed-precondition');

        // Either the host advances, or the automatic countdown has elapsed.
        const auto = game.settings.roundAdvance === 'auto';
        const nextAt = game.nextRoundAt as unknown as FirebaseFirestore.Timestamp | null;
        const countdownDone = auto && nextAt ? nextAt.toMillis() <= Date.now() : false;
        if (game.hostId !== uid && !countdownDone) throw appError('not_host', 'permission-denied');

        const names = await playerNames(tx, gameId, game.playerIds);
        const wasTieBreak = Boolean(game.isTieBreakRound);
        const roundJustPlayed = secret.state.round;

        // --- the ladder is finished: decide the game ------------------------
        if (wasTieBreak || roundJustPlayed >= TOTAL_ROUNDS) {
          const tieScores = wasTieBreak
            ? Object.fromEntries(
                secret.state.turnOrder.map((id) => [id, secret.state.players[id].roundScore ?? 0]),
              )
            : undefined;
          const decided = decideOutcome(game, tieScores);

          if (decided.needsTieBreak) {
            const tied = decided.winners;
            const { state, events } = startRound({
              round: secret.state.round,
              turnOrder: tied,
              dealerIndex: 0,
              override: { cardsDealt: TIE_BREAK_CARDS, wildRank: TIE_BREAK_WILD_RANK },
            });
            tx.set(secretRef, { state, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            tied.forEach((id) => {
              writeHand(tx, gameId, state, id);
              writePlayerPublic(tx, gameId, state, id, { roundScore: null });
            });
            tx.update(gameRef, {
              ...publicGameFields(state, game.settings),
              status: 'playing',
              isTieBreakRound: true,
              roundScores: null,
              nextRoundAt: null,
            });
            writeEvents(tx, gameId, state, events, names);
            return;
          }

          finished = true;
          tx.update(gameRef, {
            status: 'finished',
            roundStatus: 'complete',
            winnerIds: decided.winners,
            finishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            currentPlayerId: null,
            turnDeadline: null,
            nextRoundAt: null,
          });
          return;
        }

        // --- deal the next round -------------------------------------------
        const nextRound = roundJustPlayed + 1;
        const { state, events } = startRound({
          round: nextRound,
          turnOrder: game.turnOrder,
          dealerIndex: dealerIndexForRound(nextRound, game.turnOrder.length),
        });
        tx.set(secretRef, { state, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        game.turnOrder.forEach((id) => {
          writeHand(tx, gameId, state, id);
          writePlayerPublic(tx, gameId, state, id, {
            roundScore: null,
            melds: [],
            leftover: [],
            hasGoneOut: false,
          });
        });
        tx.update(gameRef, {
          ...publicGameFields(state, game.settings),
          status: 'playing',
          roundScores: null,
          nextRoundAt: null,
        });
        writeEvents(tx, gameId, state, events, names);
      });

      if (finished) await archiveGame(gameId);
      return { finished };
    })(request.data, requireAuth(request), request),
);

interface Outcome {
  winners: string[];
  needsTieBreak: boolean;
}

function decideOutcome(game: Game, tieBreakScores?: Record<string, number>): Outcome {
  if (tieBreakScores) {
    // Second pass: the tie-break round decides between the tied players.
    const winners = winnersFromTotals(tieBreakScores);
    return { winners, needsTieBreak: false };
  }
  const winners = winnersFromTotals(game.totals ?? {});
  const needsTieBreak = winners.length > 1 && game.settings.tieBreak === 'tie_break_round';
  return { winners, needsTieBreak };
}

/** Writes the immutable history document once a game is over. */
async function archiveGame(gameId: string): Promise<void> {
  const [gameSnap, playersSnap, roundsSnap, historySnap] = await Promise.all([
    col.game(gameId).get(),
    col.gamePlayers(gameId).get(),
    col.gameRounds(gameId).orderBy('roundNumber').get(),
    col.historyDoc(gameId).get(),
  ]);
  if (!gameSnap.exists || historySnap.exists) return;
  const game = gameSnap.data() as Game;

  const roundScoresByPlayer: Record<string, number[]> = {};
  roundsSnap.docs.forEach((doc) => {
    const round = doc.data() as RoundSummary & { isTieBreak?: boolean };
    if (round.isTieBreak) return;
    round.players.forEach((player) => {
      roundScoresByPlayer[player.uid] = [
        ...(roundScoresByPlayer[player.uid] ?? []),
        player.roundScore,
      ];
    });
  });

  const rankings = computeRankings(game.totals ?? {});
  const rankByUid = Object.fromEntries(rankings.map((entry) => [entry.uid, entry.rank]));
  const players = playersSnap.docs.map((doc) => doc.data());
  const startedAt = game.startedAt as unknown as FirebaseFirestore.Timestamp | null;
  const finishedAt = game.finishedAt as unknown as FirebaseFirestore.Timestamp | null;

  await col.historyDoc(gameId).set({
    id: gameId,
    gameId,
    playerIds: game.playerIds,
    players: players.map((player) => ({
      uid: player.uid as string,
      displayName: (player.displayName as string) ?? 'Player',
      photoURL: (player.photoURL as string | null) ?? null,
      finalScore: (game.totals ?? {})[player.uid as string] ?? 0,
      rank: rankByUid[player.uid as string] ?? 0,
      roundScores: roundScoresByPlayer[player.uid as string] ?? [],
    })),
    winnerIds: game.winnerIds ?? [],
    winnerNames: players
      .filter((player) => (game.winnerIds ?? []).includes(player.uid as string))
      .map((player) => (player.displayName as string) ?? 'Player'),
    rounds: roundsSnap.size,
    durationMs:
      startedAt && finishedAt ? Math.max(0, finishedAt.toMillis() - startedAt.toMillis()) : 0,
    startedAt: startedAt ?? null,
    finishedAt: finishedAt ?? FieldValue.serverTimestamp(),
    isTie: (game.winnerIds ?? []).length > 1,
    statsApplied: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await notifyMany(
    game.playerIds.map((uid) => ({
      uid,
      type: 'game_finished' as const,
      title: (game.winnerIds ?? []).includes(uid) ? 'You won!' : 'Game finished',
      body: 'Tap to see the final scores.',
      link: `/game/${gameId}/results`,
      data: { gameId },
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Presence, spectators and housekeeping                                       */
/* -------------------------------------------------------------------------- */

/** Lightweight in-game heartbeat (every ~30s while the table is open). */
export const pingGame = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('pingGame', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      const ref = col.gamePlayer(gameId, uid);
      const snap = await ref.get();
      if (!snap.exists) return { ok: false };
      await ref.update({
        connection: 'online',
        lastSeenAt: FieldValue.serverTimestamp(),
      });
      return { ok: true };
    })(request.data, requireAuth(request), request),
);

export const joinAsSpectator = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('joinAsSpectator', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      const ref = col.game(gameId);
      const snap = await ref.get();
      if (!snap.exists) throw appError('game_not_found', 'not-found');
      const game = snap.data() as Game;
      if (game.playerIds.includes(uid)) return { spectating: false };
      if (!game.settings.allowSpectators) throw appError('blocked', 'permission-denied');
      await ref.update({ spectatorIds: FieldValue.arrayUnion(uid) });
      return { spectating: true };
    })(request.data, requireAuth(request), request),
);

/** Marks a player as having left; their turns are then auto-played on timeout. */
export const leaveGame = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('leaveGame', async (data: ActionInput, uid: string) => {
      const gameId = requireString(data?.gameId, 'gameId', 64);
      const playerRef = col.gamePlayer(gameId, uid);
      const snap = await playerRef.get();
      if (snap.exists) {
        await playerRef.update({
          connection: 'disconnected',
          lastSeenAt: FieldValue.serverTimestamp(),
        });
      }
      await col.game(gameId).update({ spectatorIds: FieldValue.arrayRemove(uid) });
      return { left: true };
    })(request.data, requireAuth(request), request),
);

export { archiveGame };

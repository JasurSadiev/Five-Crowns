"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSoloGame = exports.leaveGame = exports.joinAsSpectator = exports.pingGame = exports.advanceRound = exports.enforceTurnTimeout = exports.goOut = exports.discardCard = exports.takeDiscard = exports.drawCard = exports.startGame = void 0;
exports.archiveGame = archiveGame;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
const codes_1 = require("./lib/codes");
const notify_1 = require("./lib/notify");
const game_1 = require("./shared/types/game");
const game_2 = require("./shared/game");
/* -------------------------------------------------------------------------- */
/* Writers                                                                     */
/* -------------------------------------------------------------------------- */
function turnTimestamps(settings) {
    return {
        turnStartedAt: admin_1.Timestamp.now(),
        turnDeadline: admin_1.Timestamp.fromMillis(Date.now() + settings.turnTimeoutSeconds * 1000),
    };
}
function publicGameFields(state, settings, discardedBy) {
    const top = (0, game_2.topDiscard)(state.discardPile);
    return {
        roundStatus: state.status,
        currentRound: state.round,
        wildRank: state.wildRank,
        cardsThisRound: state.cardsDealt,
        dealerIndex: state.dealerIndex,
        currentPlayerIndex: state.currentPlayerIndex,
        currentPlayerId: (0, game_2.currentPlayerId)(state),
        turnPhase: state.turnPhase,
        actionSeq: state.actionSeq,
        drawPileCount: state.drawPile.length,
        discardPileCount: state.discardPile.length,
        discardTop: { card: top, by: top ? (discardedBy ?? null) : null },
        wentOutBy: state.wentOutBy,
        finalTurnsRemaining: state.finalTurnsRemaining,
        updatedAt: admin_1.FieldValue.serverTimestamp(),
        ...turnTimestamps(settings),
    };
}
function writeHand(tx, gameId, state, uid) {
    const player = state.players[uid];
    tx.set(admin_1.col.gameHand(gameId, uid), {
        uid,
        gameId,
        round: state.round,
        cards: player.hand,
        updatedAt: admin_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
function writePlayerPublic(tx, gameId, state, uid, extra = {}) {
    const player = state.players[uid];
    tx.set(admin_1.col.gamePlayer(gameId, uid), {
        uid,
        cardCount: player.hand.length,
        hasGoneOut: player.hasGoneOut,
        roundScore: player.roundScore,
        melds: state.status === 'complete' ? player.melds : [],
        leftover: state.status === 'complete' ? player.leftover : [],
        updatedAt: admin_1.FieldValue.serverTimestamp(),
        ...extra,
    }, { merge: true });
}
function writeEvents(tx, gameId, state, events, names) {
    events.forEach((event, index) => {
        const ref = admin_1.col.gameEvents(gameId).doc();
        tx.set(ref, {
            id: ref.id,
            seq: state.actionSeq * 100 + index,
            type: event.type,
            round: state.round,
            actorId: event.actorId,
            actorName: event.actorId ? (names[event.actorId] ?? null) : null,
            payload: event.payload ?? {},
            createdAt: admin_1.FieldValue.serverTimestamp(),
        });
    });
}
/* -------------------------------------------------------------------------- */
/* Start a game                                                                */
/* -------------------------------------------------------------------------- */
exports.startGame = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('startGame', async (data, uid) => {
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    let releasedCode = null;
    const gameId = await admin_1.db.runTransaction(async (tx) => {
        const lobbyRef = admin_1.col.lobby(lobbyId);
        const lobbySnap = await tx.get(lobbyRef);
        if (!lobbySnap.exists)
            throw (0, errors_1.appError)('lobby_not_found', 'not-found');
        const lobby = lobbySnap.data();
        if (lobby.hostId !== uid)
            throw (0, errors_1.appError)('not_host', 'permission-denied');
        // A game can never start twice: the lobby must still be open.
        if (lobby.status !== 'open') {
            if (lobby.gameId)
                return lobby.gameId;
            throw (0, errors_1.appError)('lobby_closed', 'failed-precondition');
        }
        if (lobby.playerIds.length < game_1.MIN_PLAYERS) {
            throw (0, errors_1.appError)('not_enough_players', 'failed-precondition');
        }
        if (lobby.playerIds.length > game_1.MAX_PLAYERS) {
            throw (0, errors_1.appError)('too_many_players', 'failed-precondition');
        }
        const seated = [...lobby.players].sort((a, b) => a.seat - b.seat);
        const turnOrder = seated.map((player) => player.uid);
        const names = Object.fromEntries(seated.map((p) => [p.uid, p.displayName]));
        const { state, events } = (0, game_2.startRound)({
            round: 1,
            turnOrder,
            dealerIndex: (0, game_2.dealerIndexForRound)(1, turnOrder.length),
        });
        const gameRef = admin_1.col.games().doc();
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
            createdAt: admin_1.FieldValue.serverTimestamp(),
            startedAt: admin_1.FieldValue.serverTimestamp(),
            finishedAt: null,
            nextRoundAt: null,
            ...publicGameFields(state, lobby.settings),
        });
        tx.set(admin_1.col.gameSecret(gameRef.id), {
            state,
            processed: {},
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
        seated.forEach((player) => {
            writeHand(tx, gameRef.id, state, player.uid);
            tx.set(admin_1.col.gamePlayer(gameRef.id, player.uid), {
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
                lastSeenAt: admin_1.FieldValue.serverTimestamp(),
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
        });
        writeEvents(tx, gameRef.id, state, events, names);
        tx.update(lobbyRef, {
            status: 'in_game',
            gameId: gameRef.id,
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
        releasedCode = lobby.joinCode;
        return gameRef.id;
    });
    await (0, codes_1.releaseJoinCode)(releasedCode);
    const playersSnap = await admin_1.col.gamePlayers(gameId).get();
    await (0, notify_1.notifyMany)(playersSnap.docs
        .map((doc) => doc.data())
        .filter((player) => player.uid !== uid)
        .map((player) => ({
        uid: player.uid,
        type: 'game_starting',
        title: 'Your game is ready',
        body: 'Five Crowns has started - round 1, 3s are wild.',
        link: `/game/${gameId}`,
        data: { gameId },
    })));
    return { gameId };
})(request.data, (0, guards_1.requireAuth)(request), request));
/* -------------------------------------------------------------------------- */
/* Computer opponents                                                          */
/* -------------------------------------------------------------------------- */
/**
 * Plays every consecutive bot turn until it is a human's turn again.
 *
 * Bots run on the server through the identical engine functions a human goes
 * through, inside the same transaction, so there is no path by which a bot can
 * make an illegal move or a client can influence one. The guard stops a
 * pathological state from looping forever.
 */
function runBotTurns(state, game) {
    const botIds = game.botIds ?? [];
    const events = [];
    const touched = new Set();
    if (botIds.length === 0)
        return { state, events, touched: [] };
    let working = state;
    for (let guard = 0; guard < 200; guard += 1) {
        if (working.status === 'complete')
            break;
        const next = (0, game_2.currentPlayerId)(working);
        if (!next || !botIds.includes(next))
            break;
        const difficulty = game.botDifficulty?.[next] ?? 'normal';
        const result = (0, game_2.playBotTurn)(working, next, difficulty);
        if (!result.ok) {
            // Never strand the table: fall back to the conservative auto-play.
            const fallback = (0, game_2.autoPlayTurn)(working, next);
            if (!fallback.ok)
                break;
            working = fallback.state;
            events.push(...fallback.events);
        }
        else {
            working = result.state;
            events.push(...result.events);
        }
        touched.add(next);
    }
    return { state: working, events, touched: [...touched] };
}
async function mutateGame(ctx) {
    await admin_1.db.runTransaction(async (tx) => {
        const gameRef = admin_1.col.game(ctx.gameId);
        const secretRef = admin_1.col.gameSecret(ctx.gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists)
            throw (0, errors_1.appError)('game_not_found', 'not-found');
        const game = gameSnap.data();
        const secret = secretSnap.data();
        if ((0, guards_1.alreadyProcessed)(secret.processed, ctx.requestId))
            return;
        if (!game.playerIds.includes(ctx.uid))
            throw (0, errors_1.appError)('not_in_game', 'permission-denied');
        if (game.status === 'finished' || game.status === 'cancelled') {
            throw (0, errors_1.appError)('game_finished', 'failed-precondition');
        }
        if (game.status !== 'playing')
            throw (0, errors_1.appError)('round_not_active', 'failed-precondition');
        const result = ctx.mutate(secret.state, game);
        if (!result.ok)
            throw (0, errors_1.appError)(result.code, 'failed-precondition');
        // Any bots now due play immediately, in this same transaction.
        const bots = runBotTurns(result.state, game);
        const state = bots.state;
        const events = [...result.events, ...bots.events];
        const touched = [ctx.uid, ...bots.touched];
        const names = await playerNames(tx, ctx.gameId, game.playerIds);
        tx.set(secretRef, {
            state,
            processed: (0, guards_1.rememberRequest)(secret.processed, ctx.requestId),
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (state.status === 'complete') {
            finaliseRound(tx, ctx.gameId, game, state, events, names);
        }
        else {
            const discardedBy = [...events].reverse().find((event) => event.type === 'discard')?.actorId ?? null;
            for (const uid of touched) {
                writeHand(tx, ctx.gameId, state, uid);
                writePlayerPublic(tx, ctx.gameId, state, uid);
            }
            tx.update(gameRef, publicGameFields(state, game.settings, discardedBy));
            writeEvents(tx, ctx.gameId, state, events, names);
        }
    });
    return { ok: true, replayed: false };
}
async function playerNames(tx, gameId, playerIds) {
    const refs = playerIds.map((uid) => admin_1.col.gamePlayer(gameId, uid));
    if (!refs.length)
        return {};
    const snaps = await tx.getAll(...refs);
    const names = {};
    snaps.forEach((snap) => {
        const data = snap.data();
        if (data)
            names[data.uid] = data.displayName ?? 'Player';
    });
    return names;
}
/** Writes the round summary, totals and per-player results. */
function finaliseRound(tx, gameId, game, state, events, names) {
    const roundScores = {};
    for (const uid of state.turnOrder) {
        roundScores[uid] = state.players[uid].roundScore ?? 0;
    }
    const isTieBreak = Boolean(game.isTieBreakRound);
    const totals = isTieBreak ? game.totals : (0, game_2.addRoundScores)(game.totals ?? {}, roundScores);
    for (const uid of game.playerIds) {
        const player = state.players[uid];
        if (!player)
            continue;
        writeHand(tx, gameId, state, uid);
        writePlayerPublic(tx, gameId, state, uid, { totalScore: totals[uid] ?? 0 });
    }
    const summary = {
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
    tx.set(admin_1.col.gameRounds(gameId).doc(summary.id), {
        ...summary,
        completedAt: admin_1.FieldValue.serverTimestamp(),
    });
    const autoAdvance = game.settings.roundAdvance === 'auto';
    tx.update(admin_1.col.game(gameId), {
        ...publicGameFields(state, game.settings),
        status: 'round_complete',
        roundStatus: 'complete',
        roundScores,
        totals,
        nextRoundAt: autoAdvance
            ? admin_1.Timestamp.fromMillis(Date.now() + game.settings.autoAdvanceSeconds * 1000)
            : null,
        turnDeadline: null,
    });
    writeEvents(tx, gameId, state, events, names);
}
exports.drawCard = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('drawCard', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    return mutateGame({
        gameId,
        uid,
        requestId: (0, guards_1.optionalString)(data?.requestId, 64),
        mutate: (state) => (0, game_2.drawFromStock)(state, uid),
    });
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.takeDiscard = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('takeDiscard', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    return mutateGame({
        gameId,
        uid,
        requestId: (0, guards_1.optionalString)(data?.requestId, 64),
        mutate: (state) => (0, game_2.takeDiscard)(state, uid),
    });
})(request.data, (0, guards_1.requireAuth)(request), request));
/**
 * Normalises a client-submitted arrangement into engine melds. Only card ids
 * are trusted - the actual card data always comes from the server's state.
 */
function normaliseMelds(input, hand) {
    if (!Array.isArray(input) || input.length === 0)
        return undefined;
    const byId = new Map(hand.map((card) => [card.id, card]));
    const melds = [];
    for (const meld of input.slice(0, 8)) {
        const cards = [];
        for (const entry of (meld?.cards ?? []).slice(0, 14)) {
            const card = entry?.id ? byId.get(entry.id) : undefined;
            if (!card)
                return undefined;
            cards.push(card);
        }
        melds.push({ type: meld?.type === 'run' ? 'run' : 'book', cards });
    }
    return melds;
}
exports.discardCard = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('discardCard', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    const cardId = (0, guards_1.requireString)(data?.cardId, 'cardId', 40);
    return mutateGame({
        gameId,
        uid,
        requestId: (0, guards_1.optionalString)(data?.requestId, 64),
        mutate: (state) => (0, game_2.discard)(state, uid, cardId, {
            goOut: false,
            melds: normaliseMelds(data?.melds, state.players[uid]?.hand ?? []),
        }),
    });
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.goOut = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('goOut', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    const cardId = (0, guards_1.requireString)(data?.cardId, 'cardId', 40);
    return mutateGame({
        gameId,
        uid,
        requestId: (0, guards_1.optionalString)(data?.requestId, 64),
        mutate: (state) => (0, game_2.discard)(state, uid, cardId, {
            goOut: true,
            melds: normaliseMelds(data?.melds, state.players[uid]?.hand ?? []),
        }),
    });
})(request.data, (0, guards_1.requireAuth)(request), request));
/**
 * Plays a safe automatic turn once the clock has run out. Any player at the
 * table may ask for enforcement; the server checks the deadline itself.
 */
exports.enforceTurnTimeout = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('enforceTurnTimeout', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    let timedOutPlayer = null;
    await admin_1.db.runTransaction(async (tx) => {
        const gameRef = admin_1.col.game(gameId);
        const secretRef = admin_1.col.gameSecret(gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists)
            throw (0, errors_1.appError)('game_not_found', 'not-found');
        const game = gameSnap.data();
        const secret = secretSnap.data();
        if (!game.playerIds.includes(uid) && !game.spectatorIds?.includes(uid)) {
            throw (0, errors_1.appError)('not_in_game', 'permission-denied');
        }
        if (game.status !== 'playing')
            return;
        const deadline = game.turnDeadline;
        if (!deadline || deadline.toMillis() > Date.now())
            return;
        const target = (0, game_2.currentPlayerId)(secret.state);
        if (!target)
            return;
        const result = (0, game_2.autoPlayTurn)(secret.state, target);
        if (!result.ok)
            return;
        timedOutPlayer = target;
        const state = result.state;
        const names = await playerNames(tx, gameId, game.playerIds);
        tx.set(secretRef, { state, updatedAt: admin_1.FieldValue.serverTimestamp() }, { merge: true });
        const events = [
            ...result.events.map((event) => event.type === 'discard' ? { ...event, payload: { ...event.payload, timeout: true } } : event),
        ];
        if (state.status === 'complete') {
            finaliseRound(tx, gameId, game, state, events, names);
        }
        else {
            writeHand(tx, gameId, state, target);
            writePlayerPublic(tx, gameId, state, target, { connection: 'disconnected' });
            tx.update(gameRef, publicGameFields(state, game.settings, target));
            writeEvents(tx, gameId, state, events, names);
        }
    });
    return { timedOut: timedOutPlayer };
})(request.data, (0, guards_1.requireAuth)(request), request));
/* -------------------------------------------------------------------------- */
/* Round / game progression                                                    */
/* -------------------------------------------------------------------------- */
exports.advanceRound = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('advanceRound', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    let finished = false;
    await admin_1.db.runTransaction(async (tx) => {
        const gameRef = admin_1.col.game(gameId);
        const secretRef = admin_1.col.gameSecret(gameId);
        const [gameSnap, secretSnap] = await tx.getAll(gameRef, secretRef);
        if (!gameSnap.exists || !secretSnap.exists)
            throw (0, errors_1.appError)('game_not_found', 'not-found');
        const game = gameSnap.data();
        const secret = secretSnap.data();
        if (!game.playerIds.includes(uid))
            throw (0, errors_1.appError)('not_in_game', 'permission-denied');
        if (game.status === 'finished') {
            finished = true;
            return;
        }
        if (game.status !== 'round_complete')
            throw (0, errors_1.appError)('round_in_progress', 'failed-precondition');
        // Either the host advances, or the automatic countdown has elapsed.
        const auto = game.settings.roundAdvance === 'auto';
        const nextAt = game.nextRoundAt;
        const countdownDone = auto && nextAt ? nextAt.toMillis() <= Date.now() : false;
        if (game.hostId !== uid && !countdownDone)
            throw (0, errors_1.appError)('not_host', 'permission-denied');
        const names = await playerNames(tx, gameId, game.playerIds);
        const wasTieBreak = Boolean(game.isTieBreakRound);
        const roundJustPlayed = secret.state.round;
        // --- the ladder is finished: decide the game ------------------------
        if (wasTieBreak || roundJustPlayed >= game_1.TOTAL_ROUNDS) {
            const tieScores = wasTieBreak
                ? Object.fromEntries(secret.state.turnOrder.map((id) => [id, secret.state.players[id].roundScore ?? 0]))
                : undefined;
            const decided = decideOutcome(game, tieScores);
            if (decided.needsTieBreak) {
                const tied = decided.winners;
                const { state, events } = (0, game_2.startRound)({
                    round: secret.state.round,
                    turnOrder: tied,
                    dealerIndex: 0,
                    override: { cardsDealt: game_2.TIE_BREAK_CARDS, wildRank: game_2.TIE_BREAK_WILD_RANK },
                });
                tx.set(secretRef, { state, updatedAt: admin_1.FieldValue.serverTimestamp() }, { merge: true });
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
                finishedAt: admin_1.FieldValue.serverTimestamp(),
                updatedAt: admin_1.FieldValue.serverTimestamp(),
                currentPlayerId: null,
                turnDeadline: null,
                nextRoundAt: null,
            });
            return;
        }
        // --- deal the next round -------------------------------------------
        const nextRound = roundJustPlayed + 1;
        const dealt = (0, game_2.startRound)({
            round: nextRound,
            turnOrder: game.turnOrder,
            dealerIndex: (0, game_2.dealerIndexForRound)(nextRound, game.turnOrder.length),
        });
        // Bots seated before the human take their turns straight away.
        const opened = runBotTurns(dealt.state, game);
        const state = opened.state;
        const events = [...dealt.events, ...opened.events];
        tx.set(secretRef, { state, updatedAt: admin_1.FieldValue.serverTimestamp() }, { merge: true });
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
    if (finished)
        await archiveGame(gameId);
    return { finished };
})(request.data, (0, guards_1.requireAuth)(request), request));
function decideOutcome(game, tieBreakScores) {
    if (tieBreakScores) {
        // Second pass: the tie-break round decides between the tied players.
        const winners = (0, game_2.winnersFromTotals)(tieBreakScores);
        return { winners, needsTieBreak: false };
    }
    const winners = (0, game_2.winnersFromTotals)(game.totals ?? {});
    const needsTieBreak = winners.length > 1 && game.settings.tieBreak === 'tie_break_round';
    return { winners, needsTieBreak };
}
/** Writes the immutable history document once a game is over. */
async function archiveGame(gameId) {
    const [gameSnap, playersSnap, roundsSnap, historySnap] = await Promise.all([
        admin_1.col.game(gameId).get(),
        admin_1.col.gamePlayers(gameId).get(),
        admin_1.col.gameRounds(gameId).orderBy('roundNumber').get(),
        admin_1.col.historyDoc(gameId).get(),
    ]);
    if (!gameSnap.exists || historySnap.exists)
        return;
    const game = gameSnap.data();
    const roundScoresByPlayer = {};
    roundsSnap.docs.forEach((doc) => {
        const round = doc.data();
        if (round.isTieBreak)
            return;
        round.players.forEach((player) => {
            roundScoresByPlayer[player.uid] = [
                ...(roundScoresByPlayer[player.uid] ?? []),
                player.roundScore,
            ];
        });
    });
    const rankings = (0, game_2.computeRankings)(game.totals ?? {});
    const rankByUid = Object.fromEntries(rankings.map((entry) => [entry.uid, entry.rank]));
    const players = playersSnap.docs.map((doc) => doc.data());
    const startedAt = game.startedAt;
    const finishedAt = game.finishedAt;
    await admin_1.col.historyDoc(gameId).set({
        id: gameId,
        gameId,
        // Solo games are archived so the player can review them, but they are
        // excluded from statistics and leaderboards: a win against a computer
        // opponent must never dilute a board built on games between people.
        isSolo: Boolean(game.isSolo),
        botIds: game.botIds ?? [],
        playerIds: game.playerIds,
        players: players.map((player) => ({
            uid: player.uid,
            displayName: player.displayName ?? 'Player',
            photoURL: player.photoURL ?? null,
            finalScore: (game.totals ?? {})[player.uid] ?? 0,
            rank: rankByUid[player.uid] ?? 0,
            roundScores: roundScoresByPlayer[player.uid] ?? [],
        })),
        winnerIds: game.winnerIds ?? [],
        winnerNames: players
            .filter((player) => (game.winnerIds ?? []).includes(player.uid))
            .map((player) => player.displayName ?? 'Player'),
        rounds: roundsSnap.size,
        durationMs: startedAt && finishedAt ? Math.max(0, finishedAt.toMillis() - startedAt.toMillis()) : 0,
        startedAt: startedAt ?? null,
        finishedAt: finishedAt ?? admin_1.FieldValue.serverTimestamp(),
        isTie: (game.winnerIds ?? []).length > 1,
        statsApplied: false,
        createdAt: admin_1.FieldValue.serverTimestamp(),
    });
    await (0, notify_1.notifyMany)(game.playerIds.map((uid) => ({
        uid,
        type: 'game_finished',
        title: (game.winnerIds ?? []).includes(uid) ? 'You won!' : 'Game finished',
        body: 'Tap to see the final scores.',
        link: `/game/${gameId}/results`,
        data: { gameId },
    })));
}
/* -------------------------------------------------------------------------- */
/* Presence, spectators and housekeeping                                       */
/* -------------------------------------------------------------------------- */
/** Lightweight in-game heartbeat (every ~30s while the table is open). */
exports.pingGame = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('pingGame', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    const ref = admin_1.col.gamePlayer(gameId, uid);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: false };
    await ref.update({
        connection: 'online',
        lastSeenAt: admin_1.FieldValue.serverTimestamp(),
    });
    return { ok: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
exports.joinAsSpectator = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('joinAsSpectator', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    const ref = admin_1.col.game(gameId);
    const snap = await ref.get();
    if (!snap.exists)
        throw (0, errors_1.appError)('game_not_found', 'not-found');
    const game = snap.data();
    if (game.playerIds.includes(uid))
        return { spectating: false };
    if (!game.settings.allowSpectators)
        throw (0, errors_1.appError)('blocked', 'permission-denied');
    await ref.update({ spectatorIds: admin_1.FieldValue.arrayUnion(uid) });
    return { spectating: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
/** Marks a player as having left; their turns are then auto-played on timeout. */
exports.leaveGame = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('leaveGame', async (data, uid) => {
    const gameId = (0, guards_1.requireString)(data?.gameId, 'gameId', 64);
    const playerRef = admin_1.col.gamePlayer(gameId, uid);
    const snap = await playerRef.get();
    if (snap.exists) {
        await playerRef.update({
            connection: 'disconnected',
            lastSeenAt: admin_1.FieldValue.serverTimestamp(),
        });
    }
    await admin_1.col.game(gameId).update({ spectatorIds: admin_1.FieldValue.arrayRemove(uid) });
    return { left: true };
})(request.data, (0, guards_1.requireAuth)(request), request));
/* -------------------------------------------------------------------------- */
/* Single player                                                               */
/* -------------------------------------------------------------------------- */
const BOT_NAMES = ['Robin', 'Sable', 'Juno', 'Cassius', 'Odette', 'Bruno'];
/**
 * Creates a solo game against computer opponents.
 *
 * This is a completely ordinary game document: the same engine, the same
 * transaction pipeline, the same security rules, the same scoring and history.
 * Only the opponents differ. That means a solo result is as trustworthy as a
 * multiplayer one, so it can safely count towards statistics.
 */
exports.createSoloGame = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('createSoloGame', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'createSoloGame', 20, 10 * 60 * 1000);
    const opponents = (0, guards_1.requireNumber)(data?.opponents ?? 3, 'opponents', 1, game_1.MAX_PLAYERS - 1);
    const difficulty = data?.difficulty === 'easy' || data?.difficulty === 'hard'
        ? data.difficulty
        : 'normal';
    const profileSnap = await admin_1.col.user(uid).get();
    if (!profileSnap.exists)
        throw (0, errors_1.appError)('user_not_found', 'not-found');
    const profile = profileSnap.data();
    const gameRef = admin_1.col.games().doc();
    // Bot ids are namespaced to this game and are not Firebase accounts.
    const botIds = Array.from({ length: opponents }, (_, i) => `bot_${gameRef.id}_${i + 1}`);
    const botDifficulty = Object.fromEntries(botIds.map((id) => [id, difficulty]));
    // The human always sits first so the table reads naturally.
    const turnOrder = [uid, ...botIds];
    const names = { [uid]: profile.displayName ?? 'You' };
    botIds.forEach((id, i) => {
        names[id] = BOT_NAMES[i % BOT_NAMES.length];
    });
    const settings = {
        ...game_1.DEFAULT_GAME_SETTINGS,
        privacy: 'private',
        maxPlayers: turnOrder.length,
        allowSpectators: false,
        enableChat: false,
        // No human is waiting on anyone, so no clock pressure.
        turnTimeoutSeconds: 600,
        roundAdvance: 'host',
    };
    const dealt = (0, game_2.startRound)({
        round: 1,
        turnOrder,
        dealerIndex: (0, game_2.dealerIndexForRound)(1, turnOrder.length),
    });
    const game = {
        id: gameRef.id,
        botIds,
        botDifficulty,
        isSolo: true,
        playerIds: turnOrder,
        turnOrder,
        hostId: uid,
        settings,
    };
    // If a bot is on lead it plays before the human ever sees the table.
    const opened = runBotTurns(dealt.state, game);
    const state = opened.state;
    const events = [...dealt.events, ...opened.events];
    await admin_1.db.runTransaction(async (tx) => {
        tx.set(gameRef, {
            id: gameRef.id,
            lobbyId: null,
            hostId: uid,
            status: 'playing',
            playerIds: turnOrder,
            turnOrder,
            spectatorIds: [],
            botIds,
            botDifficulty,
            isSolo: true,
            settings,
            totals: Object.fromEntries(turnOrder.map((id) => [id, 0])),
            roundScores: null,
            winnerIds: [],
            isTieBreakRound: false,
            createdAt: admin_1.FieldValue.serverTimestamp(),
            startedAt: admin_1.FieldValue.serverTimestamp(),
            finishedAt: null,
            nextRoundAt: null,
            ...publicGameFields(state, settings),
        });
        tx.set(admin_1.col.gameSecret(gameRef.id), {
            state,
            processed: {},
            updatedAt: admin_1.FieldValue.serverTimestamp(),
        });
        turnOrder.forEach((id, seat) => {
            writeHand(tx, gameRef.id, state, id);
            tx.set(admin_1.col.gamePlayer(gameRef.id, id), {
                uid: id,
                displayName: names[id],
                photoURL: id === uid ? (profile.photoURL ?? null) : null,
                seat,
                isHost: id === uid,
                isBot: id !== uid,
                botDifficulty: id === uid ? null : difficulty,
                cardCount: state.players[id].hand.length,
                totalScore: 0,
                roundScore: null,
                hasGoneOut: false,
                melds: [],
                leftover: [],
                connection: 'online',
                lastSeenAt: admin_1.FieldValue.serverTimestamp(),
                updatedAt: admin_1.FieldValue.serverTimestamp(),
            });
        });
        writeEvents(tx, gameRef.id, state, events, names);
    });
    return { gameId: gameRef.id };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=game.js.map
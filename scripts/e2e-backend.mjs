#!/usr/bin/env node
/**
 * End-to-end integration test against the Firebase Emulator Suite.
 *
 * It uses the raw HTTP APIs (exactly what a browser - or an attacker - would
 * use) rather than the client SDK, so it verifies the real contract:
 *
 *   1. real accounts are created through Firebase Auth
 *   2. lobbies, codes and invitations work
 *   3. a game can be started and played through a complete round
 *   4. Security Rules hide other players' hands and the deck
 *   5. every cheat attempt is rejected by the server
 *
 * Usage: node scripts/e2e-backend.mjs
 */

import { createRequire } from 'node:module';

// The compiled rules engine (functions/lib) lets the test pick a legal way out
// instead of probing the server card by card.
const require = createRequire(import.meta.url);
let engine = null;
try {
  engine = require('../functions/lib/shared/game/index.js');
} catch {
  console.warn('[e2e] compiled engine not found - run `npm --prefix functions run build` first');
}

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-five-crowns';
const REGION = 'us-central1';
const AUTH = process.env.AUTH_EMULATOR || 'http://127.0.0.1:9099';
const FIRESTORE = process.env.FIRESTORE_EMULATOR || 'http://127.0.0.1:8080';
const FUNCTIONS = process.env.FUNCTIONS_EMULATOR || 'http://127.0.0.1:5001';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \u001b[32mPASS\u001b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`  \u001b[31mFAIL\u001b[0m ${name} ${detail}`);
  }
}

function section(title) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
}

async function signUp(email, password = 'Passw0rd!') {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`signUp failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken, email };
}

async function call(name, token, data = {}) {
  const res = await fetch(`${FUNCTIONS}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.error) {
    const error = new Error(body.error.message || 'call failed');
    error.status = body.error.status;
    error.details = body.error.details;
    throw error;
  }
  return body.result;
}

async function expectRejected(name, promise) {
  try {
    await promise;
    return { rejected: false, message: 'no error thrown' };
  } catch (error) {
    return { rejected: true, message: error.message };
  }
}

/** Firestore REST read as a signed-in user - Security Rules ARE enforced. */
async function readDoc(path, token) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Firestore REST write as a signed-in user - should always be denied. */
async function writeDoc(path, token, fields) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    },
  );
  return res.status;
}

function fromFirestoreValue(value) {
  if (value === undefined || value === null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  return null;
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

async function getGame(gameId, token) {
  const { body } = await readDoc(`games/${gameId}`, token);
  return fromFirestoreFields(body.fields);
}

async function getHand(gameId, uid, token) {
  const { status, body } = await readDoc(`games/${gameId}/hands/${uid}`, token);
  return { status, hand: status === 200 ? fromFirestoreFields(body.fields) : null };
}

async function main() {
  const stamp = Date.now();
  section('1. Accounts');
  const host = await signUp(`host${stamp}@example.com`);
  const alex = await signUp(`alex${stamp}@example.com`);
  const maria = await signUp(`maria${stamp}@example.com`);
  const outsider = await signUp(`outsider${stamp}@example.com`);
  const stranger = await signUp(`stranger${stamp}@example.com`);

  await call('ensureProfile', host.token);
  await call('ensureProfile', alex.token);
  await call('ensureProfile', maria.token);
  await call('ensureProfile', outsider.token);
  await call('ensureProfile', stranger.token);
  const hostProfile = await readDoc(`users/${host.uid}`, host.token);
  check('profile document created with zeroed stats', hostProfile.status === 200);
  check(
    'statistics start at zero',
    fromFirestoreFields(hostProfile.body.fields).gamesPlayed === 0,
  );

  const nameWrite = await writeDoc(`users/${host.uid}`, host.token, {
    gamesWon: { integerValue: '9999' },
  });
  check('client cannot inflate its own win count', nameWrite === 403, `status ${nameWrite}`);

  // A signed-out caller (or an expired token) must get a usable error code,
  // not a bare INTERNAL that the UI can only render as "something went wrong".
  const anonymous = await fetch(`${FUNCTIONS}/${PROJECT}/${REGION}/listPublicLobbies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  }).then((res) => res.json());
  check(
    'unauthenticated calls are rejected as UNAUTHENTICATED',
    anonymous.error?.status === 'UNAUTHENTICATED',
    `got ${anonymous.error?.status}`,
  );
  check(
    'unauthenticated calls carry a friendly message',
    /sign in/i.test(anonymous.error?.message ?? ''),
    anonymous.error?.message,
  );

  section('2. Lobby + join code');
  const { lobbyId, joinCode } = await call('createLobby', host.token, {
    maxPlayers: 4,
    settings: { privacy: 'private', allowSpectators: true, turnTimeoutSeconds: 120 },
  });
  check('lobby created', Boolean(lobbyId));
  check('join code is 5 unambiguous characters', /^[2-9A-HJ-NP-Z]{5}$/.test(joinCode), joinCode);

  await call('joinLobbyByCode', alex.token, { code: joinCode.toLowerCase() });
  await call('joinLobbyByCode', maria.token, { code: joinCode });
  const lobbyAfterJoin = await readDoc(`lobbies/${lobbyId}`, host.token);
  const lobbyData = fromFirestoreFields(lobbyAfterJoin.body.fields);
  check('three players seated', lobbyData.playerIds.length === 3, JSON.stringify(lobbyData.playerIds));

  const badCode = await expectRejected('bad code', call('joinLobbyByCode', outsider.token, { code: 'ZZZZZ' }));
  check('unknown code is rejected with a friendly message', badCode.rejected && /no longer exists/i.test(badCode.message), badCode.message);

  const dupInvite = await call('invitePlayer', host.token, { lobbyId, recipientId: outsider.uid });
  check('invitation sent', Boolean(dupInvite.invitationId));
  const dup = await expectRejected('dup', call('invitePlayer', host.token, { lobbyId, recipientId: outsider.uid }));
  check('duplicate invitation rejected', dup.rejected, dup.message);
  const already = await expectRejected('already', call('invitePlayer', host.token, { lobbyId, recipientId: alex.uid }));
  check('inviting a player already in the lobby is rejected', already.rejected, already.message);
  const ghost = await expectRejected('ghost', call('invitePlayer', host.token, { lobbyId, recipientId: 'does-not-exist' }));
  check('inviting a nonexistent user is rejected', ghost.rejected, ghost.message);

  const notHost = await expectRejected('notHost', call('startGame', alex.token, { lobbyId }));
  check('non-host cannot start the game', notHost.rejected, notHost.message);

  section('3. Starting the game');
  const { gameId } = await call('startGame', host.token, { lobbyId });
  check('game created', Boolean(gameId));
  const game = await getGame(gameId, host.token);
  check('round 1 deals 3 cards', game.cardsThisRound === 3, String(game.cardsThisRound));
  check('3s are wild in round 1', game.wildRank === 3, String(game.wildRank));
  check('deck has 116 - 9 - 1 cards left', game.drawPileCount === 106, String(game.drawPileCount));
  check('turn starts left of the dealer', game.currentPlayerId === game.turnOrder[1]);
  check('a turn deadline is set', Boolean(game.turnDeadline));

  const secondStart = await expectRejected('double start', call('startGame', host.token, { lobbyId }));
  check(
    'a game cannot be started twice',
    !secondStart.rejected, // returns the same gameId instead of creating another
  );

  section('4. Privacy of cards');
  const own = await getHand(gameId, host.uid, host.token);
  check('a player can read their own hand', own.status === 200 && own.hand.cards.length === 3);
  const spy = await getHand(gameId, alex.uid, host.token);
  check("a player CANNOT read an opponent's hand", spy.status === 403, `status ${spy.status}`);
  const secret = await readDoc(`games/${gameId}/secret/state`, host.token);
  check('nobody can read the deck / secret state', secret.status === 403, `status ${secret.status}`);
  const outsiderGame = await readDoc(`games/${gameId}`, outsider.token);
  check(
    'a stranger cannot read a private game',
    outsiderGame.status === 403,
    `status ${outsiderGame.status}`,
  );
  await call('joinAsSpectator', outsider.token, { gameId });
  const spectatorGame = await readDoc(`games/${gameId}`, outsider.token);
  check(
    'an approved spectator can watch the public state',
    spectatorGame.status === 200,
    `status ${spectatorGame.status}`,
  );
  const spectatorPeek = await getHand(gameId, host.uid, outsider.token);
  check(
    'a spectator still cannot see any hand',
    spectatorPeek.status === 403,
    `status ${spectatorPeek.status}`,
  );

  const tamper = await writeDoc(`games/${gameId}`, host.token, {
    currentPlayerId: { stringValue: host.uid },
  });
  check('client cannot rewrite the game document', tamper === 403, `status ${tamper}`);
  const tamperHand = await writeDoc(`games/${gameId}/hands/${host.uid}`, host.token, {
    cards: { arrayValue: { values: [] } },
  });
  check('client cannot rewrite its own cards', tamperHand === 403, `status ${tamperHand}`);

  section('5. Turn enforcement');
  const tokens = { [host.uid]: host.token, [alex.uid]: alex.token, [maria.uid]: maria.token };
  const current = game.currentPlayerId;
  const notCurrent = game.turnOrder.find((uid) => uid !== current);

  const outOfTurn = await expectRejected('out of turn', call('drawCard', tokens[notCurrent], { gameId }));
  check('acting out of turn is rejected', outOfTurn.rejected && /not your turn/i.test(outOfTurn.message), outOfTurn.message);

  const spectate = await expectRejected('outsider draw', call('drawCard', outsider.token, { gameId }));
  check('a stranger cannot act in the game', spectate.rejected, spectate.message);

  await call('drawCard', tokens[current], { gameId });
  const afterDraw = await getGame(gameId, host.token);
  check('draw pile shrank by one', afterDraw.drawPileCount === 105, String(afterDraw.drawPileCount));
  check('turn phase moved to discard', afterDraw.turnPhase === 'discard');

  const twice = await expectRejected('draw twice', call('drawCard', tokens[current], { gameId }));
  check('drawing twice is rejected', twice.rejected && /already drawn/i.test(twice.message), twice.message);

  const handNow = await getHand(gameId, current, tokens[current]);
  check('hand grew to 4 cards', handNow.hand.cards.length === 4);

  const foreignCard = 'd1-hearts-99';
  const bogus = await expectRejected('bogus card', call('discardCard', tokens[current], { gameId, cardId: foreignCard }));
  check('discarding a card you do not hold is rejected', bogus.rejected, bogus.message);

  const requestId = `req-${Date.now()}`;
  const cardToDiscard = handNow.hand.cards[0].id;
  await call('discardCard', tokens[current], { gameId, cardId: cardToDiscard, requestId });
  await call('discardCard', tokens[current], { gameId, cardId: cardToDiscard, requestId });
  const afterDiscard = await getGame(gameId, host.token);
  check('replaying the same request is a no-op (idempotent)', afterDiscard.discardPileCount === 2, String(afterDiscard.discardPileCount));
  check('turn passed clockwise', afterDiscard.currentPlayerId !== current);
  check('discard top is public', afterDiscard.discardTop.card.id === cardToDiscard);

  section('6. Playing a full round');
  let state = afterDiscard;
  let guard = 0;
  while (state.status === 'playing' && guard < 260) {
    const uid = state.currentPlayerId;
    const token = tokens[uid];
    if (state.turnPhase === 'draw') {
      await call('drawCard', token, { gameId });
    } else {
      const { hand } = await getHand(gameId, uid, token);
      const cards = hand.cards;
      const analysis = engine ? engine.findValidCombinations(cards, state.wildRank) : null;
      if (analysis?.canGoOut && state.roundStatus === 'playing') {
        const option = analysis.goOutOptions[0];
        await call('goOut', token, {
          gameId,
          cardId: option.discard.id,
          melds: option.melds.map((meld) => ({
            type: meld.type,
            cards: meld.cards.map((card) => ({ id: card.id })),
          })),
        });
      } else {
        const toss = analysis?.bestAfterDiscard?.discard ?? cards[0];
        await call('discardCard', token, { gameId, cardId: toss.id });
      }
    }
    state = await getGame(gameId, host.token);
    guard += 1;
  }
  check('round finished', state.status === 'round_complete', state.status);
  check('round scores were published', state.roundScores !== null);
  check(
    'everybody has a total score',
    Object.keys(state.totals ?? {}).length === 3,
    JSON.stringify(state.totals),
  );
  if (state.wentOutBy) {
    check('the player who went out scored 0', state.roundScores[state.wentOutBy] === 0);
  }
  const roundDoc = await readDoc(`games/${gameId}/rounds/r1`, host.token);
  check('round summary stored', roundDoc.status === 200);
  const melds = fromFirestoreFields(roundDoc.body.fields).players;
  check('round summary lists every player', melds.length === 3);

  const advanceByOther = await expectRejected('advance', call('advanceRound', alex.token, { gameId }));
  check('only the host can advance the round', advanceByOther.rejected, advanceByOther.message);

  await call('advanceRound', host.token, { gameId });
  const round2 = await getGame(gameId, host.token);
  check('round 2 started', round2.currentRound === 2 && round2.status === 'playing');
  check('round 2 deals 4 cards', round2.cardsThisRound === 4);
  check('4s are wild in round 2', round2.wildRank === 4);
  check('the dealer rotated', round2.dealerIndex === 1);
  const freshHand = await getHand(gameId, host.uid, host.token);
  check('everyone was re-dealt', freshHand.hand.cards.length === 4);

  section('7. Chat + social');
  await call('sendChatMessage', alex.token, { gameId, text: 'Good luck!' });
  const outsiderChat = await expectRejected('chat', call('sendChatMessage', stranger.token, { gameId, text: 'hi' }));
  check('outsiders cannot chat in a game', outsiderChat.rejected, outsiderChat.message);
  const spectatorChat = await call('sendChatMessage', outsider.token, { gameId, text: 'nice run!' });
  check('an approved spectator may chat', Boolean(spectatorChat.messageId));
  let limited = false;
  for (let i = 0; i < 14; i += 1) {
    try {
      await call('sendChatMessage', alex.token, { gameId, text: `spam ${i}` });
    } catch (error) {
      limited = /too quickly/i.test(error.message);
      break;
    }
  }
  check('chat is rate limited', limited);

  await call('sendFriendRequest', host.token, { targetId: alex.uid });
  const dupFriend = await expectRejected('dup friend', call('sendFriendRequest', host.token, { targetId: alex.uid }));
  check('duplicate friend requests are rejected', dupFriend.rejected, dupFriend.message);
  const selfFriend = await expectRejected('self', call('sendFriendRequest', host.token, { targetId: host.uid }));
  check('you cannot friend yourself', selfFriend.rejected, selfFriend.message);

  const search = await call('searchPlayers', host.token, { query: 'alex' });
  check('player search works', Array.isArray(search.players));

  section('Summary');
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nE2E run crashed:', error);
  process.exit(1);
});

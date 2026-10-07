import { describe, expect, it } from 'vitest';
import {
  autoPlayTurn,
  currentPlayerId,
  discard,
  drawFromStock,
  finishRound,
  startRound,
  takeDiscard,
  toPublicView,
  type RoundState,
} from '../turns';
import { seededRandom } from '../rng';
import { validateDeckIntegrity } from '../deck';
import { hand } from './helpers';
import { cardsForRound, wildRankForRound } from '../rules';

const PLAYERS = ['alex', 'maria', 'jasur', 'john'];

function newRound(round = 1, players = PLAYERS, seed = 11): RoundState {
  return startRound({ round, turnOrder: players, dealerIndex: 0, random: seededRandom(seed) }).state;
}

function piles(state: RoundState) {
  return [
    state.drawPile,
    state.discardPile,
    ...Object.values(state.players).map((p) => p.hand),
    ...Object.values(state.players).flatMap((p) => p.melds.map((m) => m.cards)),
    ...Object.values(state.players).map((p) => p.leftover),
  ];
}

describe('round setup', () => {
  it('deals the right number of cards and turns one card face up', () => {
    const state = newRound(4);
    expect(state.cardsDealt).toBe(6);
    expect(state.wildRank).toBe(6);
    PLAYERS.forEach((uid) => expect(state.players[uid].hand).toHaveLength(6));
    expect(state.discardPile).toHaveLength(1);
    expect(state.drawPile).toHaveLength(116 - 24 - 1);
    expect(validateDeckIntegrity(piles(state)).ok).toBe(true);
  });

  it('starts play with the player to the dealer left', () => {
    expect(currentPlayerId(newRound(1))).toBe('maria');
    const roundTwo = startRound({ round: 2, turnOrder: PLAYERS, dealerIndex: 1 }).state;
    expect(currentPlayerId(roundTwo)).toBe('jasur');
  });

  it('never deals the same physical card twice', () => {
    for (let round = 1; round <= 11; round += 1) {
      const state = newRound(round, PLAYERS, round);
      expect(validateDeckIntegrity(piles(state)).ok).toBe(true);
    }
  });
});

describe('turn order and legality', () => {
  it('refuses actions from players who are not on turn', () => {
    const state = newRound();
    const result = drawFromStock(state, 'alex');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_your_turn');
  });

  it('refuses actions from strangers', () => {
    const result = drawFromStock(newRound(), 'mallory');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unknown_player');
  });

  it('requires a draw before a discard', () => {
    const state = newRound();
    const cardId = state.players.maria.hand[0].id;
    const result = discard(state, 'maria', cardId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('must_draw_first');
  });

  it('forbids drawing twice', () => {
    const state = newRound();
    const first = drawFromStock(state, 'maria');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = drawFromStock(first.state, 'maria');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('already_drawn');
    const third = takeDiscard(first.state, 'maria');
    expect(third.ok).toBe(false);
  });

  it('forbids discarding a card the player does not hold', () => {
    const drawn = drawFromStock(newRound(), 'maria');
    if (!drawn.ok) throw new Error('draw failed');
    const foreign = drawn.state.players.alex.hand[0].id;
    const result = discard(drawn.state, 'maria', foreign);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('card_not_in_hand');
  });

  it('moves the turn clockwise after a discard', () => {
    const drawn = drawFromStock(newRound(), 'maria');
    if (!drawn.ok) throw new Error();
    const after = discard(drawn.state, 'maria', drawn.state.players.maria.hand[0].id);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(currentPlayerId(after.state)).toBe('jasur');
    expect(after.state.turnPhase).toBe('draw');
    expect(after.state.players.maria.hand).toHaveLength(3);
  });

  it('takes only the face-up discard and removes it from the pile', () => {
    const state = newRound();
    const top = state.discardPile[state.discardPile.length - 1];
    const result = takeDiscard(state, 'maria');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.maria.hand.map((c) => c.id)).toContain(top.id);
    expect(result.state.discardPile).toHaveLength(0);
    expect(result.state.turnPhase).toBe('discard');
  });

  it('keeps the deck intact through a full turn cycle', () => {
    let state = newRound();
    for (let i = 0; i < 12; i += 1) {
      const uid = currentPlayerId(state) as string;
      const drawn = drawFromStock(state, uid);
      if (!drawn.ok) throw new Error(drawn.message);
      const next = discard(drawn.state, uid, drawn.state.players[uid].hand[0].id);
      if (!next.ok) throw new Error(next.message);
      state = next.state;
      expect(validateDeckIntegrity(piles(state)).ok).toBe(true);
    }
  });
});

describe('going out and final turns', () => {
  function riggedRound(): RoundState {
    const state = newRound(1);
    // Rig maria with a hand that can go out after drawing.
    state.players.maria.hand = hand('8c 8h 8s');
    return state;
  }

  it('rejects an illegal attempt to go out', () => {
    const state = riggedRound();
    state.players.maria.hand = hand('8c 9h 10s');
    const drawn = drawFromStock(state, 'maria');
    if (!drawn.ok) throw new Error();
    const target = drawn.state.players.maria.hand[0].id;
    const result = discard(drawn.state, 'maria', target, { goOut: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('cannot_go_out');
  });

  it('lets a player go out and gives everybody else exactly one final turn', () => {
    const state = riggedRound();
    const drawn = drawFromStock(state, 'maria');
    if (!drawn.ok) throw new Error();
    const extra = drawn.state.players.maria.hand[3];
    const out = discard(drawn.state, 'maria', extra.id, { goOut: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.state.wentOutBy).toBe('maria');
    expect(out.state.status).toBe('final_turns');
    expect(out.state.players.maria.roundScore).toBe(0);
    expect(out.state.players.maria.melds).toHaveLength(1);
    expect(out.state.finalTurnsRemaining).toEqual(['alex', 'jasur', 'john']);
    expect(currentPlayerId(out.state)).toBe('jasur');

    let working = out.state;
    for (const uid of ['jasur', 'john', 'alex']) {
      expect(currentPlayerId(working)).toBe(uid);
      const drew = drawFromStock(working, uid);
      if (!drew.ok) throw new Error(drew.message);
      const done = discard(drew.state, uid, drew.state.players[uid].hand[0].id);
      if (!done.ok) throw new Error(done.message);
      working = done.state;
    }

    expect(working.status).toBe('complete');
    expect(working.finalTurnsRemaining).toHaveLength(0);
    PLAYERS.forEach((uid) => expect(typeof working.players[uid].roundScore).toBe('number'));
    expect(working.players.maria.roundScore).toBe(0);
  });

  it('does not let a player go out during the final turns', () => {
    const state = riggedRound();
    const drawn = drawFromStock(state, 'maria');
    if (!drawn.ok) throw new Error();
    const out = discard(drawn.state, 'maria', drawn.state.players.maria.hand[3].id, {
      goOut: true,
    });
    if (!out.ok) throw new Error();
    let working = out.state;
    working.players.jasur.hand = hand('9c 9h 9s');
    const drew = drawFromStock(working, 'jasur');
    if (!drew.ok) throw new Error();
    const done = discard(drew.state, 'jasur', drew.state.players.jasur.hand[3].id, {
      goOut: true,
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    // The round still belongs to maria; jasur simply melded and scored 0.
    expect(done.state.wentOutBy).toBe('maria');
    expect(done.state.players.jasur.hasGoneOut).toBe(false);
    expect(done.state.players.jasur.roundScore).toBe(0);
  });

  it('scores unmelded cards only, for each player separately', () => {
    const state = newRound(1);
    state.players.alex.hand = hand('Qh W1 7c');
    state.players.maria.hand = hand('8c 8h 8s');
    state.players.jasur.hand = hand('4d 5d 6d');
    state.players.john.hand = hand('Kh Kc 9s');
    const finished = finishRound(state).state;
    expect(finished.players.alex.roundScore).toBe(69); // 12 + 50 + 7
    expect(finished.players.maria.roundScore).toBe(0);
    expect(finished.players.jasur.roundScore).toBe(0);
    expect(finished.players.john.roundScore).toBe(13 + 13 + 9);
    expect(finished.status).toBe('complete');
  });

  it('finishRound is idempotent', () => {
    const first = finishRound(newRound());
    const second = finishRound(first.state);
    expect(second.events).toHaveLength(0);
    expect(second.state.status).toBe('complete');
  });
});

describe('automatic turn (disconnect timeout)', () => {
  it('draws and discards without ever going out', () => {
    const state = newRound();
    const uid = currentPlayerId(state) as string;
    const result = autoPlayTurn(state, uid, seededRandom(3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[uid].hand).toHaveLength(3);
    expect(result.state.wentOutBy).toBeNull();
    expect(currentPlayerId(result.state)).not.toBe(uid);
  });

  it('discards the least useful card', () => {
    const state = newRound(1);
    state.players.maria.hand = hand('8c 8h 8s');
    state.turnPhase = 'discard';
    state.players.maria.hand = hand('8c 8h 8s W1');
    const result = autoPlayTurn(state, 'maria', seededRandom(3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The joker is worth 50 but is useless next to a complete book, so it goes.
    expect(result.state.discardPile[result.state.discardPile.length - 1].suit).toBe('joker');
  });
});

describe('public view', () => {
  it('exposes counts but never cards', () => {
    const view = toPublicView(newRound(3));
    expect(view.cardCounts).toEqual({ alex: 5, maria: 5, jasur: 5, john: 5 });
    expect(view.discardTop).not.toBeNull();
    expect(JSON.stringify(view)).not.toContain('"hand"');
    expect(view.wildRank).toBe(wildRankForRound(3));
    expect(view.drawPileCount).toBe(116 - 20 - 1);
  });
});

describe('two to seven players', () => {
  for (const count of [2, 3, 4, 5, 6, 7]) {
    it(`deals a legal round 11 for ${count} players`, () => {
      const players = Array.from({ length: count }, (_, i) => `p${i}`);
      const state = startRound({
        round: 11,
        turnOrder: players,
        dealerIndex: count - 1,
        random: seededRandom(count),
      }).state;
      players.forEach((uid) => expect(state.players[uid].hand).toHaveLength(cardsForRound(11)));
      expect(state.drawPile.length).toBeGreaterThan(0);
      expect(validateDeckIntegrity(piles(state)).ok).toBe(true);
      expect(currentPlayerId(state)).toBe('p0');
    });
  }
});

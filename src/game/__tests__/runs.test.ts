import { describe, expect, it } from 'vitest';
import { validateRun } from '../runs';
import { hand } from './helpers';

describe('runs', () => {
  it('accepts three consecutive cards of one suit', () => {
    const result = validateRun(hand('5h 6h 7h'), 9);
    expect(result.valid).toBe(true);
    expect(result.meld?.suit).toBe('hearts');
    expect(result.meld?.startRank).toBe(5);
  });

  it('accepts longer runs including face cards', () => {
    expect(validateRun(hand('9c 10c Jc Qc'), 3).valid).toBe(true);
    expect(validateRun(hand('9c 10c Jc Qc Kc'), 3).valid).toBe(true);
  });

  it('accepts unordered input', () => {
    expect(validateRun(hand('7h 5h 6h'), 9).valid).toBe(true);
  });

  it('fills an internal gap with a joker', () => {
    expect(validateRun(hand('6h W1 8h'), 9).valid).toBe(true);
  });

  it('fills an internal gap with the round wild rank', () => {
    // 7s are wild: 6h 7d 8h is a legal run of hearts.
    expect(validateRun(hand('6h 7d 8h'), 7).valid).toBe(true);
  });

  it('lets wild cards extend a run at either end', () => {
    expect(validateRun(hand('W1 4s 5s'), 9).valid).toBe(true);
    expect(validateRun(hand('Qd Kd W1'), 9).valid).toBe(true); // wild becomes the J
    expect(validateRun(hand('Jd Qd Kd W1'), 9).valid).toBe(true); // wild becomes the 10
  });

  it('accepts several wild cards in one run', () => {
    expect(validateRun(hand('5h W1 W2 8h'), 9).valid).toBe(true);
    expect(validateRun(hand('5h W1 W2 W3'), 9).valid).toBe(true);
  });

  it('rejects mixed suits', () => {
    expect(validateRun(hand('5h 6c 7s'), 9).code).toBe('mixed_suits');
  });

  it('rejects duplicate ranks', () => {
    expect(validateRun(hand('5h 5h 6h'), 9).code).toBe('duplicate_rank');
  });

  it('rejects gaps that wilds cannot cover', () => {
    expect(validateRun(hand('5h 6h 9h'), 3).code).toBe('not_enough_wilds');
    expect(validateRun(hand('3h 7h W1'), 9).code).toBe('not_enough_wilds');
  });

  it('rejects runs that cannot fit between 3 and K', () => {
    // 3h 4h plus four wilds simply becomes 3..8 of hearts.
    expect(validateRun(hand('3h 4h W1 W2 W3 W1'), 9).valid).toBe(true);
    expect(validateRun(hand('Kh W1 W2'), 9).valid).toBe(true); // J Q K
    // A run can never run off the top of the ladder.
    expect(validateRun(hand('Jh Qh Kh W1 W2 W3 W1 W2 W3'), 9).valid).toBe(true); // 5..K
    expect(validateRun(hand('3h 4h 5h'), 9).meld?.startRank).toBe(3);
  });

  it('rejects fewer than three cards', () => {
    expect(validateRun(hand('5h 6h'), 9).code).toBe('too_few_cards');
  });

  it('rejects a run longer than the 11 available ranks', () => {
    const twelve = hand('3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh W1');
    expect(validateRun(twelve, 2 as never).code).toBe('cannot_fit_sequence');
  });
});

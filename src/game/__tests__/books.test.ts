import { describe, expect, it } from 'vitest';
import { validateBook } from '../books';
import { hand } from './helpers';

const wild7 = 7;

describe('books', () => {
  it('accepts three of a kind in different suits', () => {
    expect(validateBook(hand('8c 8h 8s'), wild7).valid).toBe(true);
  });

  it('accepts a five card book using both decks', () => {
    expect(validateBook(hand('8c 8h 8s 8t 8d'), wild7).valid).toBe(true);
    expect(validateBook(hand('8c 8c 8h'), wild7).valid).toBe(true);
  });

  it('accepts a book containing the round wild rank', () => {
    const result = validateBook(hand('8c 8h 7d'), wild7);
    expect(result.valid).toBe(true);
    expect(result.meld?.rank).toBe(8);
  });

  it('accepts adjacent and multiple wild cards', () => {
    expect(validateBook(hand('8c 7d 7h'), wild7).valid).toBe(true);
    expect(validateBook(hand('8c W1 W2'), wild7).valid).toBe(true);
    expect(validateBook(hand('8c W1 7d 7h W2'), wild7).valid).toBe(true);
  });

  it('accepts an all-wild book by default and rejects it under house rules', () => {
    expect(validateBook(hand('W1 W2 W3'), wild7).valid).toBe(true);
    expect(
      validateBook(hand('W1 W2 W3'), wild7, { allowAllWildMelds: false }).code,
    ).toBe('all_wild_not_allowed');
  });

  it('rejects fewer than three cards', () => {
    expect(validateBook(hand('8c 8h'), wild7).code).toBe('too_few_cards');
    expect(validateBook([], wild7).code).toBe('too_few_cards');
  });

  it('rejects mixed ranks', () => {
    expect(validateBook(hand('8c 9h 8s'), wild7).code).toBe('mixed_ranks');
    expect(validateBook(hand('8c 9h W1'), wild7).code).toBe('mixed_ranks');
  });

  it('knows the wild rank cannot be a natural book member', () => {
    // Three 7s when 7s are wild is an all-wild book, not a book of sevens.
    const result = validateBook(hand('7c 7h 7s'), wild7);
    expect(result.valid).toBe(true);
    expect(result.meld?.rank).toBeUndefined();
    // ...but in round 6 (6s wild) it is an ordinary book of sevens.
    expect(validateBook(hand('7c 7h 7s'), 6).meld?.rank).toBe(7);
  });
});

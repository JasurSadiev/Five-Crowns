import {
  MAX_RANK,
  MIN_RANK,
  RANKS,
  SUITS,
  type Card,
  type CardSuit,
  type DeckNumber,
  type Rank,
  type Suit,
} from '../types/card';

export { SUITS, RANKS, MIN_RANK, MAX_RANK };

export const JOKER_VALUE = 50;
export const WILD_VALUE = 20;

export const SUIT_SYMBOL: Record<CardSuit, string> = {
  stars: '★',
  hearts: '♥',
  clubs: '♣',
  spades: '♠',
  diamonds: '♦',
  joker: '🃏',
};

/** Single letter fallback so suits are identifiable without colour or glyphs. */
export const SUIT_LETTER: Record<CardSuit, string> = {
  stars: 'T',
  hearts: 'H',
  clubs: 'C',
  spades: 'S',
  diamonds: 'D',
  joker: 'W',
};

export const SUIT_LABEL: Record<CardSuit, string> = {
  stars: 'Stars',
  hearts: 'Hearts',
  clubs: 'Clubs',
  spades: 'Spades',
  diamonds: 'Diamonds',
  joker: 'Joker',
};

const RANK_LABELS: Record<number, string> = {
  11: 'J',
  12: 'Q',
  13: 'K',
};

const RANK_NAMES: Record<number, string> = {
  11: 'Jack',
  12: 'Queen',
  13: 'King',
};

export function rankLabel(rank: Rank | null): string {
  if (rank === null) return 'W';
  return RANK_LABELS[rank] ?? String(rank);
}

export function rankName(rank: Rank | null): string {
  if (rank === null) return 'Joker';
  return RANK_NAMES[rank] ?? String(rank);
}

/** Pluralised rank used for the "7s are wild" banner. */
export function rankPlural(rank: Rank): string {
  const name = RANK_NAMES[rank];
  if (name) return `${name}s`;
  return `${rank}s`;
}

export function isJoker(card: Card): boolean {
  return card.suit === 'joker';
}

/** Jokers are always wild; every card of the current round's rank is wild too. */
export function isWild(card: Card, wildRank: Rank): boolean {
  return card.suit === 'joker' || card.rank === wildRank;
}

export function cardValue(card: Card, wildRank: Rank): number {
  if (isJoker(card)) return JOKER_VALUE;
  if (card.rank === wildRank) return WILD_VALUE;
  return card.rank ?? 0;
}

export function handValue(cards: Card[], wildRank: Rank): number {
  return cards.reduce((sum, card) => sum + cardValue(card, wildRank), 0);
}

export function cardId(deck: DeckNumber, suit: CardSuit, rank: Rank | number): string {
  return `d${deck}-${suit}-${rank}`;
}

export function makeCard(deck: DeckNumber, suit: Suit, rank: Rank): Card {
  return { id: cardId(deck, suit, rank), suit, rank, deck };
}

export function makeJoker(deck: DeckNumber, index: 1 | 2 | 3): Card {
  return { id: cardId(deck, 'joker', index), suit: 'joker', rank: null, deck };
}

/** Human readable description, e.g. `Queen of Hearts (deck 2)`. */
export function describeCard(card: Card): string {
  if (isJoker(card)) return `Joker (deck ${card.deck})`;
  return `${rankName(card.rank)} of ${SUIT_LABEL[card.suit]} (deck ${card.deck})`;
}

/** Short label used in logs and replays, e.g. `Q♥`. */
export function shortCard(card: Card): string {
  if (isJoker(card)) return '🃏';
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

/** Parses a card id back into a card. Returns null when the id is malformed. */
export function parseCardId(id: string): Card | null {
  const match = /^d([12])-(stars|hearts|clubs|spades|diamonds|joker)-(\d+)$/.exec(id);
  if (!match) return null;
  const deck = Number(match[1]) as DeckNumber;
  const suit = match[2] as CardSuit;
  const value = Number(match[3]);
  if (suit === 'joker') {
    if (value < 1 || value > 3) return null;
    return { id, suit, rank: null, deck };
  }
  if (!RANKS.includes(value as Rank)) return null;
  return { id, suit, rank: value as Rank, deck };
}

export function sameCard(a: Card, b: Card): boolean {
  return a.id === b.id;
}

const SUIT_ORDER: Record<CardSuit, number> = {
  stars: 0,
  hearts: 1,
  clubs: 2,
  spades: 3,
  diamonds: 4,
  joker: 5,
};

/** Sort by rank then suit; wild cards and jokers float to the end. */
export function sortByRank(cards: Card[], wildRank: Rank): Card[] {
  return [...cards].sort((a, b) => {
    const aw = isWild(a, wildRank) ? 1 : 0;
    const bw = isWild(b, wildRank) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    const ar = a.rank ?? 99;
    const br = b.rank ?? 99;
    if (ar !== br) return ar - br;
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return a.deck - b.deck;
  });
}

/** Sort by suit then rank; wild cards and jokers float to the end. */
export function sortBySuit(cards: Card[], wildRank: Rank): Card[] {
  return [...cards].sort((a, b) => {
    const aw = isWild(a, wildRank) ? 1 : 0;
    const bw = isWild(b, wildRank) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    const ar = a.rank ?? 99;
    const br = b.rank ?? 99;
    if (ar !== br) return ar - br;
    return a.deck - b.deck;
  });
}

/** Re-orders `cards` to match the given list of ids, appending unknown cards. */
export function applyOrder(cards: Card[], order: string[]): Card[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const result: Card[] = [];
  for (const id of order) {
    const card = byId.get(id);
    if (card) {
      result.push(card);
      byId.delete(id);
    }
  }
  for (const card of byId.values()) result.push(card);
  return result;
}

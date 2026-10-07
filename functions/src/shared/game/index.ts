/**
 * The Five Crowns rules engine.
 *
 * Pure TypeScript: no React, no Firebase, no I/O. The browser imports it for
 * instant feedback, the Cloud Functions import the very same files (copied by
 * `scripts/sync-engine.mjs`) to validate every action authoritatively.
 */
export * from './cards';
export * from './deck';
export * from './rules';
export * from './books';
export * from './runs';
export * from './combinations';
export * from './scoring';
export * from './turns';
export { seededRandom, secureRandom, randomInt, type RandomSource } from './rng';
export type {
  Card,
  CardSuit,
  Suit,
  Rank,
  DeckNumber,
  Meld,
  MeldType,
  MeldValidation,
  EngineOptions,
} from '../types/card';
